import type { CalculationResult, CapacityModel, ScenarioComparisonResult } from "@capacity/domain";

export interface ModelValidationResult {
  valid: boolean;
  modelId?: string;
  counts?: {
    products: number;
    resourceGroups: number;
    routingRevisions: number;
    demandRecords: number;
    scenarios?: number;
    scenarioActions?: number;
  };
  issues?: Array<{ path: string; message: string; code: string }>;
}

export interface DemandMapping {
  productColumn: string;
  shipDateColumn: string;
  quantityColumn: string;
  productMatch: "id" | "name" | "externalKey";
  productExternalKey?: string;
  dateFormat?: "iso" | "us";
  demandClassColumn?: string;
  customerOrProgramColumn?: string;
  sourceRecordIdColumn?: string;
  defaultDemandClass?: "firm" | "forecast" | "upside" | "downside";
  sourceSystem?: string;
}

export interface DemandImportPreview {
  records: CapacityModel["demand"];
  issues: Array<{
    rowNumber: number;
    severity: "error" | "warning";
    code: string;
    message: string;
    column?: string;
    value?: string;
  }>;
  controlTotals: {
    inputRows: number;
    acceptedRows: number;
    rejectedRows: number;
    totalQuantity: number;
    quantityByProduct: Record<string, number>;
    earliestShipDate: string | null;
    latestShipDate: string | null;
  };
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  issues?: unknown;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json() as T | ApiErrorPayload;
  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    throw new Error(error.message ?? error.code ?? `Request failed with status ${response.status}`);
  }
  return payload as T;
}

export function loadNorthstar(): Promise<CapacityModel> {
  return request<CapacityModel>("/v1/fixtures/northstar-v2");
}

export function validateModel(model: CapacityModel): Promise<ModelValidationResult> {
  return request<ModelValidationResult>("/v1/validate", {
    method: "POST",
    body: JSON.stringify({ model }),
  });
}

export function calculateModel(model: CapacityModel, scenarioId: string): Promise<CalculationResult> {
  return request<CalculationResult>("/v1/calculate", {
    method: "POST",
    body: JSON.stringify({ model, scenarioId }),
  });
}

export function compareModels(
  model: CapacityModel,
  baselineScenarioId: string,
  comparisonScenarioId: string,
): Promise<ScenarioComparisonResult> {
  return request<ScenarioComparisonResult>("/v1/compare", {
    method: "POST",
    body: JSON.stringify({ model, baselineScenarioId, comparisonScenarioId }),
  });
}

export function previewDemandImport(
  model: CapacityModel,
  scenarioId: string,
  csv: string,
  mapping: DemandMapping,
): Promise<DemandImportPreview> {
  return request<DemandImportPreview>("/v1/import/demand/preview", {
    method: "POST",
    body: JSON.stringify({ model, scenarioId, csv, mapping }),
  });
}

export function applyDemandImport(
  model: CapacityModel,
  scenarioId: string,
  csv: string,
  mapping: DemandMapping,
  acceptPartial = false,
): Promise<{ model: CapacityModel; import: DemandImportPreview }> {
  return request<{ model: CapacityModel; import: DemandImportPreview }>("/v1/import/demand/apply", {
    method: "POST",
    body: JSON.stringify({ model, scenarioId, csv, mapping, acceptPartial }),
  });
}
