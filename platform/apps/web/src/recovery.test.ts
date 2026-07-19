import { describe, expect, it } from "vitest";
import { northstarRecoveryModel } from "@capacity/fixtures";
import {
  addRecoveryAction,
  findBaselineScenarioId,
  findRecoveryScenarioId,
  rejectRecoveryAction,
  setRecoveryActionIncluded,
} from "./recovery.js";

describe("recovery plan helpers", () => {
  it("finds the baseline and recovery scenarios without changing them", () => {
    expect(findBaselineScenarioId(northstarRecoveryModel)).toBe("baseline");
    expect(findRecoveryScenarioId(northstarRecoveryModel)).toBe("recovery-1");
  });

  it("adds an action only to the recovery action collection", () => {
    const baselineBefore = northstarRecoveryModel.scenarios.find(item => item.id === "baseline");
    const next = addRecoveryAction(northstarRecoveryModel, {
      id: "new-action",
      scenarioId: "recovery-1",
      name: "Add assembly equivalent",
      kind: "resourceQuantityDelta",
      resourceId: "res-assembly",
      quantityDelta: 1,
      included: true,
      status: "proposed",
      effectiveFrom: "2027-08-01",
      confidence: "medium",
    });

    expect(next.scenarioActions).toHaveLength((northstarRecoveryModel.scenarioActions?.length ?? 0) + 1);
    expect(next.scenarios.find(item => item.id === "baseline")).toEqual(baselineBefore);
    expect(northstarRecoveryModel.scenarioActions?.some(item => item.id === "new-action")).toBe(false);
  });

  it("rejects actions explicitly instead of deleting their history", () => {
    const next = rejectRecoveryAction(northstarRecoveryModel, "action-add-oven");
    expect(next.scenarioActions?.find(item => item.id === "action-add-oven")).toMatchObject({
      included: false,
      status: "rejected",
    });
  });

  it("can reinclude a rejected action by returning it to proposed status", () => {
    const rejected = rejectRecoveryAction(northstarRecoveryModel, "action-add-oven");
    const restored = setRecoveryActionIncluded(rejected, "action-add-oven", true);
    expect(restored.scenarioActions?.find(item => item.id === "action-add-oven")).toMatchObject({
      included: true,
      status: "proposed",
    });
  });
});
