import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { northstarV2Model } from "@capacity/fixtures";
import { createCapacityApiServer, routeApiRequest } from "./app.js";

const openServers: Server[] = [];

const demandMapping = {
  productColumn: "product_id",
  shipDateColumn: "ship_date",
  quantityColumn: "quantity",
  productMatch: "id",
  dateFormat: "iso",
  demandClassColumn: "class",
  sourceRecordIdColumn: "record_id",
  sourceSystem: "test-export",
};

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

  it("previews mapped demand with reconciliation totals", () => {
    const csv = [
      "product_id,ship_date,quantity,class,record_id",
      "hx100,2027-10-15,10,forecast,R1",
      "hx200,2027-11-15,5,firm,R2",
    ].join("\n");

    const response = routeApiRequest("POST", "/v1/import/demand/preview", {
      model: northstarV2Model,
      scenarioId: "baseline",
      csv,
      mapping: demandMapping,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      controlTotals: {
        inputRows: 2,
        acceptedRows: 2,
        rejectedRows: 0,
        totalQuantity: 15,
      },
    });
  });

  it("blocks partial demand replacement unless explicitly accepted", () => {
    const csv = [
      "product_id,ship_date,quantity,class,record_id",
      "hx100,2027-10-15,10,forecast,R1",
      "unknown,2027-11-15,5,firm,R2",
    ].join("\n");

    const blocked = routeApiRequest("POST", "/v1/import/demand/apply", {
      model: northstarV2Model,
      scenarioId: "baseline",
      csv,
      mapping: demandMapping,
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.body).toMatchObject({ code: "IMPORT_HAS_REJECTED_ROWS" });

    const accepted = routeApiRequest("POST", "/v1/import/demand/apply", {
      model: northstarV2Model,
      scenarioId: "baseline",
      csv,
      mapping: demandMapping,
      acceptPartial: true,
    });
    expect(accepted.statusCode).toBe(200);
    const body = accepted.body as { model: { demand: unknown[] }; import: { controlTotals: { acceptedRows: number; rejectedRows: number } } };
    expect(body.model.demand).toHaveLength(1);
    expect(body.import.controlTotals).toMatchObject({ acceptedRows: 1, rejectedRows: 1 });
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
