import { describe, expect, it } from "vitest";
import type { CapacityModel, Product } from "@capacity/domain";
import { importDemandCsv, mergeDemandImport, parseCsvTable } from "./index.js";

const products: Product[] = [
  { id: "hx100", name: "HX-100 Standard", organizationNodeId: "site", externalKeys: { sku: "HX100" } },
  { id: "hx200", name: "HX-200 High Pressure", organizationNodeId: "site", externalKeys: { sku: "HX200" } },
];

const mapping = {
  productColumn: "sku",
  shipDateColumn: "ship_date",
  quantityColumn: "quantity",
  productMatch: "externalKey" as const,
  productExternalKey: "sku",
  dateFormat: "iso" as const,
  demandClassColumn: "class",
  customerOrProgramColumn: "program",
  sourceRecordIdColumn: "record_id",
  sourceSystem: "planning-export",
};

describe("CSV parser", () => {
  it("handles BOM, quoted commas, escaped quotes, and CRLF", () => {
    const table = parseCsvTable('\uFEFFsku,program,quantity\r\nHX100,"Launch, Wave ""A""",10\r\n');
    expect(table.headers).toEqual(["sku", "program", "quantity"]);
    expect(table.rows[0]).toEqual({ sku: "HX100", program: 'Launch, Wave "A"', quantity: "10" });
  });

  it("rejects duplicate headers", () => {
    expect(() => parseCsvTable("sku,sku\nA,B")).toThrow("duplicate headers");
  });
});

describe("demand CSV import", () => {
  it("maps accepted rows and reports control totals", () => {
    const csv = [
      "sku,ship_date,quantity,class,program,record_id",
      'HX100,2027-10-15,"1,200",forecast,"Launch, Wave 1",A1',
      "HX200,2027-11-15,50,firm,Launch,A2",
    ].join("\n");

    const result = importDemandCsv(csv, products, "baseline", mapping);
    expect(result.issues).toEqual([]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      id: "import-baseline-A1",
      productId: "hx100",
      quantity: 1200,
      customerOrProgram: "Launch, Wave 1",
      sourceRecordId: "A1",
    });
    expect(result.controlTotals).toMatchObject({
      inputRows: 2,
      acceptedRows: 2,
      rejectedRows: 0,
      warningRows: 0,
      totalQuantity: 1250,
      quantityByProduct: { hx100: 1200, hx200: 50 },
      earliestShipDate: "2027-10-15",
      latestShipDate: "2027-11-15",
    });
  });

  it("rejects unknown products, invalid dates, quantities, and classes by row", () => {
    const csv = [
      "sku,ship_date,quantity,class,program,record_id",
      "BAD,2027-10-15,10,forecast,Launch,B1",
      "HX100,10/15/2027,10,forecast,Launch,B2",
      "HX100,2027-10-15,-1,forecast,Launch,B3",
      "HX100,2027-10-15,10,guess,Launch,B4",
    ].join("\n");

    const result = importDemandCsv(csv, products, "baseline", mapping);
    expect(result.records).toHaveLength(0);
    expect(result.controlTotals.rejectedRows).toBe(4);
    expect(result.issues.map(issue => issue.code)).toEqual([
      "PRODUCT_NOT_FOUND",
      "SHIP_DATE_INVALID",
      "QUANTITY_INVALID",
      "DEMAND_CLASS_INVALID",
    ]);
  });

  it("can atomically replace one scenario's demand", () => {
    const model = {
      scenarios: [{ id: "baseline", name: "Baseline", kind: "baseline", createdAt: "2026-07-18T00:00:00.000Z" }],
      demand: [
        { id: "old-baseline", scenarioId: "baseline", productId: "hx100", shipDate: "2027-01-15", quantity: 1 },
        { id: "other", scenarioId: "other", productId: "hx100", shipDate: "2027-01-15", quantity: 2 },
      ],
    } as CapacityModel;

    const imported = [{ id: "new", scenarioId: "baseline", productId: "hx200", shipDate: "2027-02-15", quantity: 3 }];
    const merged = mergeDemandImport(model, "baseline", imported);
    expect(merged.demand.map(record => record.id)).toEqual(["other", "new"]);
  });
});
