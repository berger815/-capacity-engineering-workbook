import { describe, expect, it } from "vitest";
import { northstarRecoveryModel } from "@capacity/fixtures";
import { calculateCapacity, compareCapacityScenarios } from "./index.js";

function row(
  comparison: ReturnType<typeof compareCapacityScenarios>,
  resourceGroupId: string,
  periodStart: string,
) {
  const match = comparison.rows.find(item => item.resourceGroupId === resourceGroupId && item.periodStart === periodStart);
  expect(match).toBeDefined();
  return match!;
}

describe("governed recovery scenarios", () => {
  it("inherits baseline demand without copying demand records", () => {
    const baseline = calculateCapacity(northstarRecoveryModel, "baseline");
    const recovery = calculateCapacity(northstarRecoveryModel, "recovery-1");

    expect(recovery.demandSourceScenarioId).toBe("baseline");
    expect(recovery.appliedActionIds).toEqual([
      "action-add-oven",
      "action-weld-overtime",
      "action-add-test-stand",
    ]);
    expect(recovery.results.reduce((sum, item) => sum + item.load, 0)).toBeCloseTo(
      baseline.results.reduce((sum, item) => sum + item.load, 0),
      8,
    );
  });

  it("applies added equipment only from its effective date", () => {
    const comparison = compareCapacityScenarios(northstarRecoveryModel, "baseline", "recovery-1");
    expect(row(comparison, "rg-oven", "2027-06-01").capacityDelta).toBe(0);
    expect(row(comparison, "rg-oven", "2027-07-01").capacityDelta).toBeGreaterThan(0);
  });

  it("applies temporary capacity multipliers only inside their approved window", () => {
    const comparison = compareCapacityScenarios(northstarRecoveryModel, "baseline", "recovery-1");
    expect(row(comparison, "rg-weld", "2027-08-01").capacityDelta).toBe(0);
    expect(row(comparison, "rg-weld", "2027-09-01").capacityDelta).toBeGreaterThan(0);
    expect(row(comparison, "rg-weld", "2027-12-01").capacityDelta).toBeGreaterThan(0);
  });

  it("preserves load while exposing capacity and gap deltas", () => {
    const comparison = compareCapacityScenarios(northstarRecoveryModel, "baseline", "recovery-1");
    expect(comparison.rows.every(item => item.loadDelta === 0)).toBe(true);
    expect(comparison.rows.some(item => item.capacityDelta > 0 && item.gapDelta > 0)).toBe(true);
    expect(comparison.appliedActionIds).toHaveLength(3);
  });
});
