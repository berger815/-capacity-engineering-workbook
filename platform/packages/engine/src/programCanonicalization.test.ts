import { describe, expect, it } from "vitest";
import { capacityModelSchema, collectModelIssues, type CapacityModel } from "@capacity/domain";
import { explainConstraint } from "./explain.js";
import { calculateCapacity } from "./index.js";

function bulkProgramModel(memberCount = 100, conflicting = false): CapacityModel {
  const products = Array.from({ length: memberCount }, (_, index) => ({
    id: `part-${index + 1}`,
    name: `Bulk part ${index + 1}`,
    organizationNodeId: "site",
  }));
  const routingRevisions = products.map((product, index) => ({
    id: `route-${product.id}`,
    productId: product.id,
    revision: "A",
    effectiveFrom: "2026-01-01",
    phases: [{
      id: `phase-${product.id}`,
      name: "Program engineering",
      startWeeksBeforeShip: 4,
      endWeeksBeforeShip: 0,
      allocation: "spread" as const,
    }],
    operations: [{
      id: `operation-${product.id}`,
      sequence: 10,
      name: "Program engineering",
      phaseId: `phase-${product.id}`,
      requirements: [{
        id: "shared-program-engineering",
        resourceGroupId: "engineering",
        basis: "perProgram" as const,
        requirement: {
          state: "value" as const,
          value: conflicting && index === memberCount - 1 ? 300 : 290,
          unit: "hours" as const,
        },
      }],
    }],
  }));

  return {
    schemaVersion: "1.0.0",
    modelId: "bulk-program",
    name: "Bulk program",
    planningGranularity: "month",
    horizonStart: "2026-01-01",
    horizonEnd: "2026-06-30",
    organization: [{ id: "site", name: "Site", type: "site" }],
    calendars: [{
      id: "standard",
      name: "Standard",
      timezone: "UTC",
      weeklyMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 },
      exceptions: [],
    }],
    resourceGroups: [{
      id: "engineering",
      name: "Design engineering",
      organizationNodeId: "site",
      kind: "labor",
      capacityUnit: "hours",
      calendarId: "standard",
      pooled: true,
      indirect: true,
    }],
    resources: [{
      id: "engineering-pool",
      resourceGroupId: "engineering",
      name: "Engineering pool",
      quantity: 4,
      ratePerAvailableHour: 1,
      availability: 1,
      performance: 1,
      quality: 1,
    }],
    products,
    programs: [{
      id: "bulk-launch",
      name: "Bulk launch",
      productIds: products.map(product => product.id),
      anchorDate: "2026-04-15",
    }],
    routingRevisions,
    scenarios: [{
      id: "baseline",
      name: "Baseline",
      kind: "baseline",
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    demand: [],
  };
}

describe("program requirement canonicalization", () => {
  it("charges one shared per-program requirement once across 100 routed products", () => {
    const model = bulkProgramModel();
    const calculation = calculateCapacity(model, "baseline");
    expect(calculation.issues.filter(issue => issue.severity === "error")).toEqual([]);
    expect(calculation.results.reduce((sum, row) => sum + row.load, 0)).toBeCloseTo(290, 10);
  });

  it("reconciles the canonical program load through constraint explanation", () => {
    const model = bulkProgramModel();
    const calculation = calculateCapacity(model, "baseline");
    const loaded = calculation.results.find(row => row.load > 0);
    expect(loaded).toBeDefined();
    const explanation = explainConstraint(model, "baseline", "engineering", loaded!.periodStart);
    expect(explanation.contributions).toHaveLength(1);
    expect(explanation.contributions[0]).toMatchObject({
      demandId: "program:bulk-launch",
      programId: "bulk-launch",
      requirementId: "shared-program-engineering",
      basis: "perProgram",
    });
    expect(explanation.totalExplainedLoad).toBeCloseTo(loaded!.load, 10);
    expect(explanation.unexplainedLoad).toBeCloseTo(0, 10);
  });

  it("rejects conflicting definitions that reuse a program requirement id", () => {
    const model = bulkProgramModel(2, true);
    expect(collectModelIssues(model)).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "PROGRAM_REQUIREMENT_CONFLICT",
      entityId: "shared-program-engineering",
    }));
    const calculation = calculateCapacity(model, "baseline");
    expect(calculation.issues).toContainEqual(expect.objectContaining({ code: "PROGRAM_REQUIREMENT_CONFLICT" }));
    expect(calculation.results.reduce((sum, row) => sum + row.load, 0)).toBeCloseTo(290, 10);
  });

  it("preserves the indirect classification through runtime schema parsing", () => {
    const parsed = capacityModelSchema.parse(bulkProgramModel(1));
    expect(parsed.resourceGroups[0]?.indirect).toBe(true);
  });
});
