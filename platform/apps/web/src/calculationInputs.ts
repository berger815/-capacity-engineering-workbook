import type { CapacityModel } from "@capacity/domain";

export const CALCULATION_FIELD_POLICY = {
  schemaVersion: "input",
  modelId: "input",
  name: "input",
  planningGranularity: "input",
  horizonStart: "input",
  horizonEnd: "input",
  organization: "input",
  calendars: "input",
  resourceGroups: "input",
  resources: "input",
  products: "input",
  programs: "input",
  routingRevisions: "input",
  scenarios: "input",
  demand: "input",
  scenarioActions: "input",
  actionLog: "excluded",
  footprintPlans: "excluded",
  planningWip: "excluded",
  supplier: "excluded",
  assessmentDate: "excluded",
  metadata: "excluded",
} satisfies Record<keyof CapacityModel, "input" | "excluded">;

export function calculationInputSnapshot(model: CapacityModel): Partial<CapacityModel> {
  return Object.fromEntries(
    Object.entries(model).filter(([key]) => CALCULATION_FIELD_POLICY[key as keyof CapacityModel] === "input"),
  ) as Partial<CapacityModel>;
}

export function calculationInputsChanged(previous: CapacityModel | null, next: CapacityModel): boolean {
  return !previous || JSON.stringify(calculationInputSnapshot(previous)) !== JSON.stringify(calculationInputSnapshot(next));
}

export function weeklyScaleWarning(model: CapacityModel): string | null {
  if (model.planningGranularity !== "week" || model.demand.length <= 2_000) return null;
  return `Weekly resolution with ${model.demand.length.toLocaleString()} demand records may take several seconds. Keep this tab open until calculation completes.`;
}
