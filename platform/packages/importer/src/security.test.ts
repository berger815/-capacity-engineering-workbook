import { describe, expect, it } from "vitest";
import type { CapacityModel } from "@capacity/domain";
import { exportProductsCsv, parseCsvTable } from "./index.js";

function modelWithProduct(name: string, family: string, externalKey: string): CapacityModel {
  return {
    schemaVersion: "1.0.0",
    modelId: "security-model",
    name: "Security export",
    planningGranularity: "month",
    horizonStart: "2026-01-01",
    horizonEnd: "2026-12-31",
    organization: [{ id: "site", name: "Site", type: "site" }],
    calendars: [],
    resourceGroups: [],
    resources: [],
    products: [{ id: "p1", name, family, organizationNodeId: "site", externalKeys: { source: externalKey } }],
    routingRevisions: [],
    scenarios: [],
    demand: [],
  };
}

describe("import security boundaries", () => {
  it("rejects CSV data beyond the configured row limit", () => {
    expect(() => parseCsvTable("id\n1\n2", ",", 1)).toThrow("data-row assessment limit");
  });

  it("prefixes user-controlled spreadsheet formulas in exported CSV", () => {
    const exported = exportProductsCsv(modelWithProduct("=2+3", " +cmd", "@external"));
    expect(exported).toContain("'=2+3");
    expect(exported).toContain("' +cmd");
    expect(exported).toContain("'@external");
  });
});
