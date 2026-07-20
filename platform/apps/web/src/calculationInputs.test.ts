import { describe, expect, it } from "vitest";
import { northstarRecoveryModel } from "@capacity/fixtures";
import { CALCULATION_FIELD_POLICY, calculationInputsChanged, weeklyScaleWarning } from "./calculationInputs.js";

describe("calculation input staleness", () => {
  it("uses an explicit policy covering the complete CapacityModel surface", () => {
    expect(Object.entries(CALCULATION_FIELD_POLICY).filter(([, policy]) => policy === "excluded").map(([key]) => key).sort()).toEqual([
      "actionLog", "assessmentDate", "footprintPlans", "metadata", "planningWip", "supplier",
    ]);
  });

  it("invalidates results for horizon, granularity, scenario, and program changes", () => {
    const model = structuredClone(northstarRecoveryModel);
    expect(calculationInputsChanged(model, { ...model, horizonEnd: "2028-01-31" })).toBe(true);
    expect(calculationInputsChanged(model, { ...model, planningGranularity: "week" })).toBe(true);
    expect(calculationInputsChanged(model, { ...model, scenarios: [...model.scenarios, { id: "sensitivity", name: "Sensitivity", kind: "sensitivity", createdAt: "2026-07-20T00:00:00.000Z" }] })).toBe(true);
    expect(calculationInputsChanged(model, { ...model, programs: [{ id: "p", name: "P", productIds: [], anchorDate: "2027-01-01" }] })).toBe(true);
  });

  it("does not invalidate capacity results for reporting-only context", () => {
    const model = structuredClone(northstarRecoveryModel);
    expect(calculationInputsChanged(model, { ...model, assessmentDate: "2026-07-20" })).toBe(false);
    expect(calculationInputsChanged(model, { ...model, metadata: { changed: true } })).toBe(false);
  });

  it("warns only for large weekly models", () => {
    const model = structuredClone(northstarRecoveryModel);
    model.planningGranularity = "week";
    model.demand = Array.from({ length: 2_001 }, (_, index) => ({ ...model.demand[0]!, id: `d-${index}` }));
    expect(weeklyScaleWarning(model)).toContain("2,001");
  });
});
