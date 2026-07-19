import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { routeApiRequest as routeExistingRequest, type ApiResult } from "./app.js";
import { routeEntityImportRequest } from "./importRoutes.js";

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export type { ApiResult } from "./app.js";

export function routeApiRequest(method: string, path: string, body?: unknown): ApiResult {
  return routeEntityImportRequest(method, path, body) ?? routeExistingRequest(method, path, body);
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
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
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
        const body = method === "POST" || method === "PUT" || method === "PATCH" ? await readJsonBody(request) : undefined;
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
