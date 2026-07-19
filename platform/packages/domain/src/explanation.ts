import type { Id, IsoDate, ModelIssue, ResourcePeriodResult } from "./model.js";

export interface LoadContribution {
  scenarioId: Id;
  resourceGroupId: Id;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  demandId: Id;
  productId: Id;
  routingRevisionId: Id;
  operationId: Id;
  operationName: string;
  requirementId: Id;
  phaseId: Id;
  phaseName: string;
  shipDate: IsoDate;
  originalDemandQuantity: number;
  adjustedDemandQuantity: number;
  phaseAllocation: number;
  unitRequirement: number;
  setupLoad: number;
  runLoad: number;
  totalLoad: number;
}

export interface ProductLoadSummary {
  productId: Id;
  load: number;
  shareOfPeriodLoad: number;
  demandRecordCount: number;
  earliestShipDate: IsoDate;
  latestShipDate: IsoDate;
}

export interface OperationLoadSummary {
  operationId: Id;
  operationName: string;
  load: number;
  shareOfPeriodLoad: number;
}

export interface ConstraintExplanation {
  modelId: Id;
  scenarioId: Id;
  resourceGroupId: Id;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  result: ResourcePeriodResult;
  totalExplainedLoad: number;
  unexplainedLoad: number;
  contributions: LoadContribution[];
  products: ProductLoadSummary[];
  operations: OperationLoadSummary[];
  issues: ModelIssue[];
  demandSourceScenarioId: Id;
  appliedActionIds: Id[];
}
