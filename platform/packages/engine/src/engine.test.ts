import { describe, expect, it } from "vitest";
import type { CapacityModel } from "@capacity/domain";
import { calculateCapacity } from "./index.js";

const model: CapacityModel = {
  schemaVersion: "1.0.0",
  modelId: "northstar-test",
  name: "Northstar vertical slice",
  planningGranularity: "month",
  horizonStart: "2026-12-01",
  horizonEnd: "2027-03-31",
  organization: [
    { id: "site", name: "Northstar", type: "site" },
  ],
  calendars: [
    {
      id: "weekday",
      name: "Weekday calendar",
      timezone: "America/New_York",
      weeklyMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 },
      exceptions: [{ date: "2027-01-01", availableMinutes: 0, reason: "Holiday" }],
    },
  ],
  resourceGroups: [
    { id: "weld", name: "Welding", organizationNodeId: "site", kind: "labor", capacityUnit: "hours", calendarId: "weekday", pooled: true },
    { id: "heat", name: "Heat Treatment", organizationNodeId: "site", kind: "equipment", capacityUnit: "hours", calendarId: "weekday", pooled: true },
  ],
  resources: [
    { id: "welder-pool", resourceGroupId: "weld", name: "Welders", quantity: 1, ratePerAvailableHour: 1, availability: 1, performance: 1, quality: 1 },
    { id: "oven", resourceGroupId: "heat", name: "Oven", quantity: 1, ratePerAvailableHour: 1, availability: 1, performance: 1, quality: 1 },
  ],
  products: [
    { id: "standard", name: "Standard", organizationNodeId: "site" },
    { id: "modular", name: "Modular", organizationNodeId: "site" },
  ],
  routingRevisions: [
    {
      id: "standard-a",
      productId: "standard",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: [{ id: "fab-20", name: "Fabrication", startWeeksBeforeShip: 20, endWeeksBeforeShip: 8, allocation: "spread" }],
      operations: [{
        id: "standard-weld",
        sequence: 10,
        name: "Weld",
        phaseId: "fab-20",
        requirements: [
          { id: "standard-weld-hours", resourceGroupId: "weld", requirement: { state: "value", value: 120, unit: "hours" } },
          { id: "standard-no-heat", resourceGroupId: "heat", requirement: { state: "notApplicable", unit: "hours" } },
        ],
      }],
    },
    {
      id: "modular-a",
      productId: "modular",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: [{ id: "integration-8", name: "Integration", startWeeksBeforeShip: 8, endWeeksBeforeShip: 2, allocation: "spread" }],
      operations: [{
        id: "modular-integrate",
        sequence: 10,
        name: "Integrate",
        phaseId: "integration-8",
        requirements: [
          { id: "modular-no-weld", resourceGroupId: "weld", requirement: { state: "notApplicable", unit: "hours" } },
          { id: "modular-no-heat", resourceGroupId: "heat", requirement: { state: "notApplicable", unit: "hours" } },
        ],
      }],
    },
  ],
  scenarios: [{ id: "baseline", name: "Baseline", kind: "baseline", createdAt: "2026-07-18T00:00:00.000Z" }],
  demand: [
    { id: "d1", scenarioId: "baseline", productId: "standard", shipDate: "2027-03-15", quantity: 2 },
    { id: "d2", scenarioId: "baseline", productId: "modular", shipDate: "2027-03-15", quantity: 50 },
  ],
};

describe("capacity engine", () => {
  it("places long-lead work before the shipment year", () => {
    const result = calculateCapacity(model, "baseline");
    const december = result.results.find(item => item.resourceGroupId === "weld" && item.periodStart === "2026-12-01");
    expect(december).toBeDefined();
    expect(december!.load).toBeGreaterThan(0);
  });

  it("does not load resources marked not applicable", () => {
    const result = calculateCapacity(model, "baseline");
    const heatLoad = result.results.filter(item => item.resourceGroupId === "heat").reduce((sum, item) => sum + item.load, 0);
    expect(heatLoad).toBe(0);
  });

  it("honors calendar exceptions when calculating capacity", () => {
    const result = calculateCapacity(model, "baseline");
    const january = result.results.find(item => item.resourceGroupId === "weld" && item.periodStart === "2027-01-01");
    expect(january).toBeDefined();
    expect(january!.capacity).toBe(160);
  });

  it("identifies the highest-utilization resource period", () => {
    const result = calculateCapacity(model, "baseline");
    expect(result.governingConstraint?.resourceGroupId).toBe("weld");
  });
});
