import { describe, expect, it } from "vitest";
import type { CapacityModel, ResourceGroup, ScenarioAction } from "@capacity/domain";
import {
  actionResourceGroupId,
  checklistScore,
  plannedCapacityPercent,
  plannedQuantityDelta,
  recoverySection,
} from "./recovery-workbench.js";

const group = (kind: ResourceGroup["kind"]): ResourceGroup => ({
  id: `group-${kind}`,
  name: kind,
  organizationNodeId: "site",
  kind,
  capacityUnit: "hours",
  calendarId: "calendar",
  pooled: true,
});

const model = {
  resources: [{ id: "resource-1", resourceGroupId: "labor-1", name: "Crew", quantity: 4 }],
} as unknown as CapacityModel;

const quantityAction: ScenarioAction = {
  id: "a1",
  scenarioId: "recovery",
  name: "Add crew",
  kind: "resourceQuantityDelta",
  included: true,
  status: "approved",
  effectiveFrom: "2027-07-01",
  confidence: "high",
  resourceId: "resource-1",
  quantityDelta: 2,
};

const multiplierAction: ScenarioAction = {
  id: "a2",
  scenarioId: "recovery",
  name: "Add shift",
  kind: "resourceCapacityMultiplier",
  included: true,
  status: "proposed",
  effectiveFrom: "2027-08-01",
  confidence: "medium",
  resourceGroupId: "labor-1",
  multiplier: 1.25,
};

describe("recovery workbench helpers", () => {
  it("keeps labor and equipment in their original planning sections", () => {
    expect(recoverySection(group("labor"))).toBe("labor");
    expect(recoverySection(group("skill"))).toBe("labor");
    expect(recoverySection(group("equipment"))).toBe("equipment");
    expect(recoverySection(group("tooling"))).toBe("equipment");
    expect(recoverySection(group("space"))).toBe("other");
  });

  it("maps actions back to the affected resource group", () => {
    expect(actionResourceGroupId(model, quantityAction)).toBe("labor-1");
    expect(actionResourceGroupId(model, multiplierAction)).toBe("labor-1");
  });

  it("summarizes included quantity and capacity changes", () => {
    expect(plannedQuantityDelta([quantityAction, multiplierAction])).toBe(2);
    expect(plannedCapacityPercent([quantityAction, multiplierAction])).toBeCloseTo(25);
  });

  it("scores partial checklist completion", () => {
    expect(checklistScore({ route: 1, owner: 0.5, finance: 0 }, ["route", "owner", "finance"]).percent).toBe(0.5);
  });
});
