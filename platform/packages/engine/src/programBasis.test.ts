import { describe, expect, it } from "vitest";
import type { CapacityModel, Product } from "@capacity/domain";
import { calculateCapacity } from "./index.js";

function programModel(): CapacityModel {
  const extraProducts: Product[] = Array.from({ length: 99 }, (_, index) => ({
    id: `bulk-${index + 2}`,
    name: `Bulk part ${index + 2}`,
    organizationNodeId: "site",
  }));
  return {
    schemaVersion: "1.0.0",
    modelId: "program-basis",
    name: "Program basis hand check",
    planningGranularity: "month",
    horizonStart: "2027-01-01",
    horizonEnd: "2027-03-31",
    organization: [{ id: "site", name: "Supplier", type: "site" }],
    calendars: [{ id: "calendar", name: "Weekdays", timezone: "UTC", weeklyMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 }, exceptions: [] }],
    resourceGroups: [
      { id: "direct", name: "Direct labor", organizationNodeId: "site", kind: "labor", capacityUnit: "hours", calendarId: "calendar", pooled: true },
      { id: "engineering", name: "Engineering", organizationNodeId: "site", kind: "labor", capacityUnit: "hours", calendarId: "calendar", pooled: true, indirect: true },
      { id: "planning", name: "Planning", organizationNodeId: "site", kind: "labor", capacityUnit: "hours", calendarId: "calendar", pooled: true, indirect: true },
    ],
    resources: [],
    products: [{ id: "bulk-1", name: "Bulk part 1", organizationNodeId: "site" }, ...extraProducts],
    programs: [{ id: "project-a", name: "Project A", productIds: ["bulk-1", ...extraProducts.map(product => product.id)], anchorDate: "2027-02-15", endDate: "2027-03-20" }],
    routingRevisions: [{
      id: "bulk-1-a",
      productId: "bulk-1",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: [
        { id: "launch", name: "Launch engineering", startWeeksBeforeShip: 4, endWeeksBeforeShip: 0, allocation: "spread" },
        { id: "ship", name: "Ship work", startWeeksBeforeShip: 0, endWeeksBeforeShip: 0, allocation: "shiftToEnd" },
      ],
      operations: [
        { id: "engineering-op", sequence: 10, name: "Project engineering", phaseId: "launch", requirements: [{ id: "engineering-hours", resourceGroupId: "engineering", basis: "perProgram", requirement: { state: "value", value: 290, unit: "hours" } }] },
        { id: "planning-op", sequence: 20, name: "Program planning", phaseId: "launch", requirements: [{ id: "planning-hours", resourceGroupId: "planning", basis: "perPeriod", requirement: { state: "value", value: 10, unit: "hours" } }] },
        { id: "direct-op", sequence: 30, name: "Build", phaseId: "ship", requirements: [{ id: "direct-hours", resourceGroupId: "direct", requirement: { state: "value", value: 2, unit: "hours" } }] },
      ],
    }],
    scenarios: [{ id: "baseline", name: "Baseline", kind: "baseline", createdAt: "2026-07-20T00:00:00.000Z" }],
    demand: [{ id: "demand", scenarioId: "baseline", productId: "bulk-1", shipDate: "2027-02-15", quantity: 3 }],
  };
}

function load(model: CapacityModel, groupId: string, periodStart: string): number {
  return calculateCapacity(model, "baseline").results.find(row => row.resourceGroupId === groupId && row.periodStart === periodStart)?.load ?? -1;
}

describe("requirement bases", () => {
  it("matches hand-computed per-unit, per-program, and per-period load", () => {
    const model = programModel();
    expect(load(model, "direct", "2027-02-01")).toBe(6);
    expect(load(model, "engineering", "2027-01-01")).toBe(140);
    expect(load(model, "engineering", "2027-02-01")).toBe(150);
    expect(load(model, "planning", "2027-01-01")).toBe(0);
    expect(load(model, "planning", "2027-02-01")).toBe(10);
    expect(load(model, "planning", "2027-03-01")).toBe(10);
  });

  it("charges one project requirement once for a 100-product program", () => {
    const result = calculateCapacity(programModel(), "baseline");
    expect(result.results.filter(row => row.resourceGroupId === "engineering").reduce((sum, row) => sum + row.load, 0)).toBe(290);
  });

  it("counts each requirement on exactly one load path", () => {
    const result = calculateCapacity(programModel(), "baseline");
    expect(result.results.reduce((sum, row) => sum + row.load, 0)).toBe(316);
  });

  it("generates pre-ramp engineering load with zero demand", () => {
    const model = programModel();
    model.demand = [];
    const result = calculateCapacity(model, "baseline");
    expect(result.results.filter(row => row.resourceGroupId === "direct").reduce((sum, row) => sum + row.load, 0)).toBe(0);
    expect(result.results.filter(row => row.resourceGroupId === "engineering").reduce((sum, row) => sum + row.load, 0)).toBe(290);
  });
});
