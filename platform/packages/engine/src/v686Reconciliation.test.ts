import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { capacityModelSchema, type CapacityModel } from "@capacity/domain";
import { calculateCapacity } from "./index.js";
import {
  capturedV686Output,
  v686SharedInput,
  type V686SharedInput,
} from "./v686SharedInput.js";

const LEGACY_SOURCE_PATH = fileURLToPath(
  new URL("../../../../legacy/capacity-workbook-v6.86.html", import.meta.url),
);

interface ReconciliationMetrics {
  oee: number;
  laborCapacity: number;
  laborLoad: number;
  equipmentCapacity: number;
  equipmentLoad: number;
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Legacy function not found: ${name}`);
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) throw new Error(`Legacy function body not found: ${name}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated legacy function: ${name}`);
}

function runLegacyWorkbook(input: V686SharedInput): ReconciliationMetrics {
  const source = readFileSync(LEGACY_SOURCE_PATH, "utf8");
  const functions = [
    "getOEE",
    "getEfficiency",
    "getBaseCap",
    "getRwk",
    "getDemCapActive",
    "getNetAvail",
    "getDeptLoadAnnual",
    "getEqCurrentAnnualCapacity",
    "getEqRawLoadMonthly",
    "getEqLoad",
  ].map(name => extractFunction(source, name));

  const values: Record<string, string | number> = {
    oee_a_d0: input.availability * 100,
    oee_p_d0: input.performance * 100,
    oee_q_d0: input.quality * 100,
    cap_d0: input.grossHoursPerResource * input.labor.resourceCount,
    eff_rwk_d0: input.labor.rework * 100,
    demcap_hrs_d0: 0,
  };
  const context: Record<string, unknown> = {
    reconciliation: undefined,
    sv: (id: string) => values[id] ?? "",
    gv: (id: string) => Number(values[id] ?? 0),
    clampNum: (value: unknown, minimum: number, maximum: number, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
    },
    leadTimeAdjust: false,
    ltSpreadMode: false,
    RESOLUTION: "annual",
    EQ_SPREAD_CACHE: null,
    STATE: {
      generated: true,
      years: [input.year],
      depts: [{ type: "labor" }],
      mlis: [{}],
    },
    equipmentConfig: [{
      dept: 0,
      count: input.equipment.resourceCount,
      hrs: input.grossHoursPerResource,
      oee: input.availability * input.performance * input.quality * 100,
      routing: [input.equipment.routingHoursPerUnit],
    }],
    getDemAnnualAdjustedForDept: () => input.demandUnits,
    getSH: () => input.labor.standardHoursPerUnit,
    getCF: () => 1,
    getDemMonthly: (_modelIndex: number, _yearIndex: number, monthIndex: number) =>
      monthIndex === 11 ? input.demandUnits : 0,
  };

  vm.runInNewContext(
    `${functions.join("\n")}
     reconciliation = {
       oee: getOEE(0) / 100,
       laborCapacity: getNetAvail(0),
       laborLoad: getDeptLoadAnnual(0, 0),
       equipmentCapacity: getEqCurrentAnnualCapacity(0),
       equipmentLoad: getEqLoad(0, 0, undefined, false)
     };`,
    context,
  );
  return context.reconciliation as ReconciliationMetrics;
}

function sharedModel(input: V686SharedInput): CapacityModel {
  const lossAdjustedLaborStandard = input.labor.standardHoursPerUnit * (1 + input.labor.rework);
  const lossAdjustedEquipmentStandard = input.equipment.routingHoursPerUnit * (1 + input.equipment.rework);
  return {
    schemaVersion: "1.0.0",
    modelId: "v686-reconciliation",
    name: "v6.86 shared reconciliation input",
    planningGranularity: "month",
    horizonStart: `${input.year}-01-01`,
    horizonEnd: `${input.year}-12-31`,
    organization: [{ id: "site", name: "Shared supplier", type: "site" }],
    calendars: [{
      id: "weekday-calendar",
      name: "Weekdays",
      timezone: "UTC",
      weeklyMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 },
      exceptions: [],
    }],
    resourceGroups: [
      { id: "labor", name: "Labor", organizationNodeId: "site", kind: "labor", capacityUnit: "hours", calendarId: "weekday-calendar", pooled: true },
      { id: "equipment", name: "Equipment", organizationNodeId: "site", kind: "equipment", capacityUnit: "hours", calendarId: "weekday-calendar", pooled: true },
    ],
    resources: [
      {
        id: "labor-resource",
        resourceGroupId: "labor",
        name: "Labor pool",
        quantity: input.labor.resourceCount,
        ratePerAvailableHour: 1,
        availability: input.availability,
        performance: input.performance,
        quality: input.quality,
      },
      {
        id: "equipment-resource",
        resourceGroupId: "equipment",
        name: "Equipment pool",
        quantity: input.equipment.resourceCount,
        ratePerAvailableHour: 1,
        availability: input.availability,
        performance: input.performance,
        quality: input.quality,
      },
    ],
    products: [{ id: "shared-product", name: "Shared product", organizationNodeId: "site" }],
    routingRevisions: [{
      id: "shared-routing",
      productId: "shared-product",
      revision: "A",
      effectiveFrom: `${input.year}-01-01`,
      phases: [{ id: "ship", name: "Ship", startWeeksBeforeShip: 0, endWeeksBeforeShip: 0, allocation: "shiftToEnd" }],
      operations: [
        {
          id: "labor-operation",
          sequence: 10,
          name: "Labor operation",
          phaseId: "ship",
          requirements: [{ id: "labor-standard", resourceGroupId: "labor", requirement: { state: "value", value: lossAdjustedLaborStandard, unit: "hours" } }],
        },
        {
          id: "equipment-operation",
          sequence: 20,
          name: "Equipment operation",
          phaseId: "ship",
          requirements: [{ id: "equipment-standard", resourceGroupId: "equipment", requirement: { state: "value", value: lossAdjustedEquipmentStandard, unit: "hours" } }],
        },
      ],
    }],
    scenarios: [{ id: "baseline", name: "Baseline", kind: "baseline", createdAt: `${input.year}-01-01T00:00:00.000Z` }],
    demand: [{ id: "shared-demand", scenarioId: "baseline", productId: "shared-product", shipDate: `${input.year}-12-31`, quantity: input.demandUnits }],
  };
}

function totalFor(result: ReturnType<typeof calculateCapacity>, groupId: string, field: "load" | "capacity"): number {
  return result.results
    .filter(row => row.resourceGroupId === groupId)
    .reduce((sum, row) => sum + row[field], 0);
}

describe("v6.86 executable reconciliation", () => {
  it("pins the exact checked-in workbook used as the legacy oracle", () => {
    const source = readFileSync(LEGACY_SOURCE_PATH);
    expect(createHash("sha256").update(source).digest("hex")).toBe(v686SharedInput.referenceSourceSha256);
  });

  it("matches labor and equipment capacity and load on a shared input set", () => {
    const legacy = runLegacyWorkbook(v686SharedInput);
    const model = sharedModel(v686SharedInput);
    expect(capacityModelSchema.safeParse(model).success).toBe(true);
    const current = calculateCapacity(model, "baseline");

    expect(legacy.oee).toBeCloseTo(capturedV686Output.oee, 12);
    expect(legacy.laborCapacity).toBeCloseTo(capturedV686Output.laborCapacity, 10);
    expect(legacy.laborLoad).toBeCloseTo(capturedV686Output.laborLoad, 10);
    expect(legacy.equipmentCapacity).toBeCloseTo(capturedV686Output.equipmentCapacity, 10);
    expect(legacy.equipmentLoad).toBeCloseTo(capturedV686Output.equipmentLoad, 10);
    expect(legacy.oee).toBeCloseTo(
      v686SharedInput.availability * v686SharedInput.performance * v686SharedInput.quality,
      12,
    );
    expect(totalFor(current, "labor", "capacity")).toBeCloseTo(legacy.laborCapacity, 10);
    expect(totalFor(current, "labor", "load")).toBeCloseTo(legacy.laborLoad, 10);
    expect(totalFor(current, "equipment", "capacity")).toBeCloseTo(legacy.equipmentCapacity, 10);
    expect(totalFor(current, "equipment", "load")).toBeCloseTo(legacy.equipmentLoad, 10);
  });
});
