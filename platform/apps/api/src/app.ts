import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { CapacityModel } from "@capacity/domain";
import { capacityModelSchema } from "@capacity/domain";
import { calculateCapacity } from "@capacity/engine";
import { northstarV2Model } from "@capacity/fixtures";

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export interface ApiResult {
  statusCode: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function routeApiRequest(method: string, path: string, body?: unknown): ApiResult {
  if (method === "GET" && path === "/health") {
    return {
      statusCode: 200,
      body: {
        status: "ok",
        service: "capacity-assurance-api",
        schemaVersion: "1.0.0",
      },
    };
  }

  if (method === "GET" && path === "/v1/fixtures/northstar-v2") {
    return { statusCode: 200, body: northstarV2Model };
  }

  if (method === "POST" && path === "/v1/validate") {
    const candidate = isRecord(body) && "model" in body ? body.model : body;
    const validation = capacityModelSchema.safeParse(candidate);
    return validation.success
      ? {
          statusCode: 200,
          body: {
            valid: true,
            modelId: validation.data.modelId,
            counts: {
              products: validation.data.products.length,
              resourceGroups: validation.data.resourceGroups.length,
              routingRevisions: validation.data.routingRevisions.length,
              demandRecords: validation.data.demand.length,
            },
          },
        }
      : {
          statusCode: 422,
          body: {
            valid: false,
            code: "MODEL_VALIDATION_FAILED",
            issues: validation.error.issues.map(issue => ({
              path: issue.path.join("."),
              message: issue.message,
              code: issue.code,
            })),
          },
        };
  }

  if (method === "POST" && path === "/v1/calculate") {
    if (!isRecord(body)) {
      return { statusCode: 400, body: { code: "INVALID_REQUEST", message: "JSON object required" } };
    }

    const scenarioId = body.scenarioId;
    if (typeof scenarioId !== "string" || scenarioId.length === 0) {
      return { statusCode: 400, body: { code: "SCENARIO_REQUIRED", message: "scenarioId is required" } };
    }

    const validation = capacityModelSchema.safeParse(body.model);
    if (!validation.success) {
      return {
        statusCode: 422,
        body: {
          code: "MODEL_VALIDATION_FAILED",
          issues: validation.error.issues.map(issue => ({
            path: issue.path.join("."),
            message: issue.message,
            code: issue.code,
          })),
        },
      };
    }

    try {
      const result = calculateCapacity(validation.data as CapacityModel, scenarioId);
      return { statusCode: 200, body: result };
    } catch (error) {
      return {
        statusCode: 400,
        body: {
          code: "CALCULATION_REJECTED",
          message: error instanceof Error ? error.message : "Calculation rejected",
        },
      };
    }
  }

  return { statusCode: 404, body: { code: "NOT_FOUND", message: `${method} ${path} not found` } };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }

  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
}

function writeJson(response: ServerResponse, result: ApiResult): void {
  const payload = JSON.stringify(result.body);
  response.statusCode = result.statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(payload));
  response.end(payload);
}

export function createCapacityApiServer(): Server {
  return createServer((request, response) => {
    void (async () => {
      try {
        const method = request.method ?? "GET";
        const url = new URL(request.url ?? "/", "http://capacity.local");
        const body = method === "POST" || method === "PUT" || method === "PATCH"
          ? await readJsonBody(request)
          : undefined;
        writeJson(response, routeApiRequest(method, url.pathname, body));
      } catch (error) {
        if (error instanceof SyntaxError) {
          writeJson(response, { statusCode: 400, body: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
          return;
        }
        if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
          writeJson(response, { statusCode: 413, body: { code: "REQUEST_TOO_LARGE", message: "Request exceeds 10 MB" } });
          return;
        }
        writeJson(response, { statusCode: 500, body: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
      }
    })();
  });
}
