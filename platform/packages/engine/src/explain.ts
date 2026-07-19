import type {
  CapacityModel,
  ConstraintExplanation,
  DemandRecord,
  LeadTimePhase,
  LoadContribution,
  OperationLoadSummary,
  ProductLoadSummary,
  RoutingRevision,
  Scenario,
  ScenarioAction,
} from "@capacity/domain";
import { calculateCapacity } from "./index.js";

const DAY_MS = 86_400_000;

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function periodEnd(periodStart: string, granularity: "week" | "month"): Date {
  const start = parseDate(periodStart);
  return granularity === "week"
    ? addDays(start, 6)
    : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
}

function resolveScenarioChain(model: CapacityModel, scenarioId: string): Scenario[] {
  const scenarios = new Map(model.scenarios.map(item => [item.id, item]));
  const target = scenarios.get(scenarioId);
  if (!target) throw new Error(`Scenario not found: ${scenarioId}`);

  const reversed: Scenario[] = [];
  const visited = new Set<string>();
  let cursor: Scenario | undefined = target;
  while (cursor) {
    if (visited.has(cursor.id)) throw new Error(`Scenario parent cycle detected at ${cursor.id}`);
    visited.add(cursor.id);
    reversed.push(cursor);
    cursor = cursor.parentScenarioId ? scenarios.get(cursor.parentScenarioId) : undefined;
  }
  return reversed.reverse();
}

function demandForScenario(model: CapacityModel, scenarioId: string): { records: DemandRecord[]; sourceScenarioId: string } {
  const chain = resolveScenarioChain(model, scenarioId);
  for (const scenario of [...chain].reverse()) {
    const records = model.demand.filter(item => item.scenarioId === scenario.id && item.quantity > 0);
    if (records.length > 0) return { records, sourceScenarioId: scenario.id };
  }
  return { records: [], sourceScenarioId: scenarioId };
}

function actionsForScenario(model: CapacityModel, scenarioId: string): ScenarioAction[] {
  const scenarioIds = new Set(resolveScenarioChain(model, scenarioId).map(item => item.id));
  return (model.scenarioActions ?? [])
    .filter(action => scenarioIds.has(action.scenarioId))
    .filter(action => action.included && action.status !== "rejected")
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id));
}

function isActive(date: string, effectiveFrom?: string, effectiveTo?: string): boolean {
  return (!effectiveFrom || effectiveFrom <= date) && (!effectiveTo || effectiveTo >= date);
}

function adjustedDemandQuantity(demand: DemandRecord, actions: ScenarioAction[]): number {
  const multiplier = actions
    .filter(action => action.kind === "demandMultiplier")
    .filter(action => !action.productId || action.productId === demand.productId)
    .filter(action => isActive(demand.shipDate, action.effectiveFrom, action.effectiveTo))
    .reduce((product, action) => product * action.multiplier, 1);
  return demand.quantity * multiplier;
}

function revisionForDemand(revisions: RoutingRevision[], demand: DemandRecord): RoutingRevision | undefined {
  return revisions
    .filter(revision => revision.productId === demand.productId)
    .filter(revision => revision.effectiveFrom <= demand.shipDate && (!revision.effectiveTo || revision.effectiveTo >= demand.shipDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

function phaseDates(shipDate: string, phase: LeadTimePhase): { start: Date; end: Date } {
  const ship = parseDate(shipDate);
  const start = addDays(ship, -Math.round(phase.startWeeksBeforeShip * 7));
  const end = addDays(ship, -Math.round(phase.endWeeksBeforeShip * 7));
  return start <= end ? { start, end } : { start: end, end: start };
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end < start ? 0 : Math.floor((end - start) / DAY_MS) + 1;
}

function phaseAllocation(phase: LeadTimePhase, shipDate: string, start: Date, end: Date): number {
  const range = phaseDates(shipDate, phase);
  if (phase.allocation === "shiftToStart") return start <= range.start && range.start <= end ? 1 : 0;
  if (phase.allocation === "shiftToEnd") return start <= range.end && range.end <= end ? 1 : 0;
  if (phase.allocation === "shiftToMidpoint") {
    const midpoint = new Date((range.start.getTime() + range.end.getTime()) / 2);
    return start <= midpoint && midpoint <= end ? 1 : 0;
  }
  const totalDays = overlapDays(range.start, range.end, range.start, range.end);
  return totalDays === 0 ? 0 : overlapDays(range.start, range.end, start, end) / totalDays;
}

function summarizeProducts(contributions: LoadContribution[], totalLoad: number): ProductLoadSummary[] {
  const grouped = new Map<string, LoadContribution[]>();
  for (const contribution of contributions) {
    grouped.set(contribution.productId, [...(grouped.get(contribution.productId) ?? []), contribution]);
  }
  return [...grouped.entries()].map(([productId, rows]) => {
    const load = rows.reduce((sum, row) => sum + row.totalLoad, 0);
    const dates = rows.map(row => row.shipDate).sort();
    return {
      productId,
      load,
      shareOfPeriodLoad: totalLoad > 0 ? load / totalLoad : 0,
      demandRecordCount: new Set(rows.map(row => row.demandId)).size,
      earliestShipDate: dates[0]!,
      latestShipDate: dates.at(-1)!,
    };
  }).sort((a, b) => b.load - a.load);
}

function summarizeOperations(contributions: LoadContribution[], totalLoad: number): OperationLoadSummary[] {
  const grouped = new Map<string, { name: string; load: number }>();
  for (const contribution of contributions) {
    const current = grouped.get(contribution.operationId) ?? { name: contribution.operationName, load: 0 };
    current.load += contribution.totalLoad;
    grouped.set(contribution.operationId, current);
  }
  return [...grouped.entries()].map(([operationId, value]) => ({
    operationId,
    operationName: value.name,
    load: value.load,
    shareOfPeriodLoad: totalLoad > 0 ? value.load / totalLoad : 0,
  })).sort((a, b) => b.load - a.load);
}

export function explainConstraint(
  model: CapacityModel,
  scenarioId: string,
  resourceGroupId: string,
  periodStart: string,
): ConstraintExplanation {
  const calculation = calculateCapacity(model, scenarioId);
  const result = calculation.results.find(row => row.resourceGroupId === resourceGroupId && row.periodStart === periodStart);
  if (!result) throw new Error(`Resource period not found: ${resourceGroupId} ${periodStart}`);

  const start = parseDate(result.periodStart);
  const end = periodEnd(result.periodStart, model.planningGranularity);
  const demandSelection = demandForScenario(model, scenarioId);
  const actions = actionsForScenario(model, scenarioId);
  const contributions: LoadContribution[] = [];

  for (const demand of demandSelection.records) {
    const adjustedQuantity = adjustedDemandQuantity(demand, actions);
    if (adjustedQuantity <= 0) continue;
    const revision = revisionForDemand(model.routingRevisions, demand);
    if (!revision) continue;
    const phases = new Map(revision.phases.map(phase => [phase.id, phase]));

    for (const operation of revision.operations) {
      const phase = phases.get(operation.phaseId);
      if (!phase) continue;
      const allocation = phaseAllocation(phase, demand.shipDate, start, end);
      if (allocation === 0) continue;

      for (const requirement of operation.requirements.filter(item => item.resourceGroupId === resourceGroupId)) {
        const value = requirement.requirement;
        if (value.state !== "value" || value.value === undefined) continue;

        const runLoad = value.value * adjustedQuantity * allocation;
        let setupLoad = 0;
        if (requirement.setupRequirement?.state === "value" && requirement.setupRequirement.value !== undefined) {
          const batchSize = requirement.batchSize ?? operation.maximumBatchSize ?? operation.minimumBatchSize ?? adjustedQuantity;
          const batches = batchSize > 0 ? Math.ceil(adjustedQuantity / batchSize) : 1;
          setupLoad = requirement.setupRequirement.value * batches * allocation;
        }
        const totalLoad = runLoad + setupLoad;
        if (totalLoad === 0) continue;

        contributions.push({
          scenarioId,
          resourceGroupId,
          periodStart: result.periodStart,
          periodEnd: result.periodEnd,
          demandId: demand.id,
          productId: demand.productId,
          routingRevisionId: revision.id,
          operationId: operation.id,
          operationName: operation.name,
          requirementId: requirement.id,
          phaseId: phase.id,
          phaseName: phase.name,
          shipDate: demand.shipDate,
          originalDemandQuantity: demand.quantity,
          adjustedDemandQuantity: adjustedQuantity,
          phaseAllocation: allocation,
          unitRequirement: value.value,
          setupLoad,
          runLoad,
          totalLoad,
        });
      }
    }
  }

  contributions.sort((a, b) => b.totalLoad - a.totalLoad || a.shipDate.localeCompare(b.shipDate));
  const totalExplainedLoad = contributions.reduce((sum, row) => sum + row.totalLoad, 0);

  return {
    modelId: model.modelId,
    scenarioId,
    resourceGroupId,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    result,
    totalExplainedLoad,
    unexplainedLoad: result.load - totalExplainedLoad,
    contributions,
    products: summarizeProducts(contributions, totalExplainedLoad),
    operations: summarizeOperations(contributions, totalExplainedLoad),
    issues: calculation.issues,
    demandSourceScenarioId: calculation.demandSourceScenarioId ?? scenarioId,
    appliedActionIds: calculation.appliedActionIds ?? [],
  };
}
