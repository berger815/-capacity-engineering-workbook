import { capacityModelSchema, type CapacityModel } from "@capacity/domain";
import {
  importCalendarsCsv,
  importProductsCsv,
  importResourceGroupsCsv,
  importResourcesCsv,
  importRoutingCsv,
  mergeCalendarsImport,
  mergeProductsImport,
  mergeResourceGroupsImport,
  mergeResourcesImport,
  mergeRoutingImport,
  type CalendarCsvMapping,
  type CalendarExceptionCsvMapping,
  type ImportResult,
  type MergeMode,
  type ProductCsvMapping,
  type ResourceCsvMapping,
  type ResourceGroupCsvMapping,
  type RoutingCsvMapping,
} from "@capacity/importer";
import type { ApiResult } from "./app.js";

type EntityRoute = "calendars" | "resource-groups" | "resources" | "products" | "routing";
type ActionRoute = "preview" | "apply";

interface ImportRequest {
  model: CapacityModel;
  csv: string;
  mapping: Record<string, unknown>;
  mode: MergeMode;
  acceptPartial: boolean;
  exceptionsCsv?: string;
  exceptionMapping?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRoute(path: string): { entity: EntityRoute; action: ActionRoute } | null {
  const match = /^\/v1\/import\/(calendars|resource-groups|resources|products|routing)\/(preview|apply)$/.exec(path);
  if (!match) return null;
  return { entity: match[1] as EntityRoute, action: match[2] as ActionRoute };
}

function invalidRequest(code: string, message: string): ApiResult {
  return { statusCode: 400, body: { code, message } };
}

function parseRequest(body: unknown): { request: ImportRequest } | { result: ApiResult } {
  if (!isRecord(body)) return { result: invalidRequest("INVALID_REQUEST", "JSON object required") };
  if (typeof body.csv !== "string") return { result: invalidRequest("CSV_REQUIRED", "csv must be a string") };
  if (!isRecord(body.mapping)) return { result: invalidRequest("MAPPING_REQUIRED", "mapping must be an object") };
  const validation = capacityModelSchema.safeParse(body.model);
  if (!validation.success) {
    return {
      result: {
        statusCode: 422,
        body: {
          code: "MODEL_VALIDATION_FAILED",
          issues: validation.error.issues.map(issue => ({ path: issue.path.map(String).join("."), message: issue.message, code: issue.code })),
        },
      },
    };
  }
  const mode = body.mode ?? "replaceById";
  if (mode !== "append" && mode !== "replaceById") return { result: invalidRequest("MERGE_MODE_INVALID", "mode must be append or replaceById") };
  if (body.exceptionsCsv !== undefined && typeof body.exceptionsCsv !== "string") return { result: invalidRequest("EXCEPTIONS_CSV_INVALID", "exceptionsCsv must be a string") };
  if (body.exceptionMapping !== undefined && !isRecord(body.exceptionMapping)) return { result: invalidRequest("EXCEPTION_MAPPING_INVALID", "exceptionMapping must be an object") };

  return {
    request: {
      model: validation.data as CapacityModel,
      csv: body.csv,
      mapping: body.mapping,
      mode,
      acceptPartial: body.acceptPartial === true,
      ...(typeof body.exceptionsCsv === "string" ? { exceptionsCsv: body.exceptionsCsv } : {}),
      ...(isRecord(body.exceptionMapping) ? { exceptionMapping: body.exceptionMapping } : {}),
    },
  };
}

function preview(entity: EntityRoute, request: ImportRequest): ImportResult<unknown> {
  switch (entity) {
    case "calendars":
      return importCalendarsCsv(
        request.csv,
        request.exceptionsCsv,
        request.model,
        request.mapping as unknown as CalendarCsvMapping,
        request.exceptionMapping as unknown as CalendarExceptionCsvMapping | undefined,
        request.mode,
      ) as ImportResult<unknown>;
    case "resource-groups":
      return importResourceGroupsCsv(request.csv, request.model, request.mapping as unknown as ResourceGroupCsvMapping, request.mode) as ImportResult<unknown>;
    case "resources":
      return importResourcesCsv(request.csv, request.model, request.mapping as unknown as ResourceCsvMapping, request.mode) as ImportResult<unknown>;
    case "products":
      return importProductsCsv(request.csv, request.model, request.mapping as unknown as ProductCsvMapping, request.mode) as ImportResult<unknown>;
    case "routing":
      return importRoutingCsv(request.csv, request.model, request.mapping as unknown as RoutingCsvMapping) as ImportResult<unknown>;
  }
}

function apply(entity: EntityRoute, request: ImportRequest, imported: ImportResult<unknown>): CapacityModel {
  switch (entity) {
    case "calendars":
      return mergeCalendarsImport(request.model, imported.records as CapacityModel["calendars"], request.mode);
    case "resource-groups":
      return mergeResourceGroupsImport(request.model, imported.records as CapacityModel["resourceGroups"], request.mode);
    case "resources":
      return mergeResourcesImport(request.model, imported.records as CapacityModel["resources"], request.mode);
    case "products":
      return mergeProductsImport(request.model, imported.records as CapacityModel["products"], request.mode);
    case "routing":
      return mergeRoutingImport(request.model, imported.records as CapacityModel["routingRevisions"]);
  }
}

export function routeEntityImportRequest(method: string, path: string, body: unknown): ApiResult | null {
  if (method !== "POST") return null;
  const route = parseRoute(path);
  if (!route) return null;
  const parsed = parseRequest(body);
  if ("result" in parsed) return parsed.result;

  try {
    const imported = preview(route.entity, parsed.request);
    if (route.action === "preview") return { statusCode: 200, body: imported };
    const hasErrors = imported.issues.some(issue => issue.severity === "error");
    if (hasErrors && !parsed.request.acceptPartial) {
      return {
        statusCode: 422,
        body: {
          code: "IMPORT_HAS_REJECTED_ROWS",
          message: "Import contains rejected records; set acceptPartial=true to apply accepted records",
          import: imported,
        },
      };
    }

    const candidate = apply(route.entity, parsed.request, imported);
    const validation = capacityModelSchema.safeParse(candidate);
    if (!validation.success) {
      return {
        statusCode: 422,
        body: {
          code: "IMPORTED_MODEL_INVALID",
          message: "Accepted records would produce an invalid model; no changes were applied",
          import: imported,
          issues: validation.error.issues.map(issue => ({ path: issue.path.map(String).join("."), message: issue.message, code: issue.code })),
        },
      };
    }
    return { statusCode: 200, body: { model: validation.data, import: imported } };
  } catch (error) {
    return {
      statusCode: 400,
      body: { code: "IMPORT_REJECTED", message: error instanceof Error ? error.message : "Import rejected" },
    };
  }
}
