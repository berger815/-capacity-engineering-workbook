import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { northstarV2Model } from "@capacity/fixtures";
import { createCapacityApiServer, routeApiRequest } from "./app.js";

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

describe("Capacity Assurance API", () => {
  it("validates the canonical Northstar fixture", () => {
    const response = routeApiRequest("POST", "/v1/validate", { model: northstarV2Model });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      valid: true,
      modelId: "northstar-v2",
      counts: { products: 4, resourceGroups: 12, routingRevisions: 4, demandRecords: 48 },
    });
  });

  it("calculates Northstar and pulls long-lead work into 2026", () => {
    const response = routeApiRequest("POST", "/v1/calculate", {
      model: northstarV2Model,
      scenarioId: "baseline",
    });
    expect(response.statusCode).toBe(200);

    const result = response.body as {
      results: Array<{ periodStart: string; load: number; resourceGroupId: string }>;
      governingConstraint: unknown;
      issues: unknown[];
    };

    expect(result.governingConstraint).not.toBeNull();
    expect(result.results.some(row => row.periodStart.startsWith("2026-") && row.load > 0)).toBe(true);
    expect(result.results.some(row => row.resourceGroupId === "rg-oven" && row.load > 0)).toBe(true);
  });

  it("rejects invalid models before calculation", () => {
    const response = routeApiRequest("POST", "/v1/calculate", {
      model: { modelId: "broken" },
      scenarioId: "baseline",
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toMatchObject({ code: "MODEL_VALIDATION_FAILED" });
  });

  it("serves the same behavior over HTTP", async () => {
    const server = createCapacityApiServer();
    openServers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: northstarV2Model, scenarioId: "baseline" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { modelId: string; results: unknown[] };
    expect(body.modelId).toBe("northstar-v2");
    expect(body.results.length).toBeGreaterThan(0);
  });
});
