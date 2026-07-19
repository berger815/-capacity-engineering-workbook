import type { CapacityModel, DemandRecord, Product } from "@capacity/domain";
import { parseCsvTable } from "./csv.js";
import {
  type BaseImportControlTotals,
  type BaseImportMapping,
  type ImportDateFormat,
  type ImportIssue,
  type ImportResult,
  parseIsoDate,
  parseNumber,
  requiredHeaders,
  rowHasError,
  textValue,
  warningRowCount,
} from "./shared.js";

export type ProductMatchMode = "id" | "name" | "externalKey";

export interface DemandCsvMapping extends BaseImportMapping {
  productColumn: string;
  shipDateColumn: string;
  quantityColumn: string;
  productMatch: ProductMatchMode;
  productExternalKey?: string;
  dateFormat?: ImportDateFormat;
  demandClassColumn?: string;
  customerOrProgramColumn?: string;
  sourceRecordIdColumn?: string;
  defaultDemandClass?: "firm" | "forecast" | "upside" | "downside";
}

export interface DemandImportControlTotals extends BaseImportControlTotals {
  totalQuantity: number;
  quantityByProduct: Record<string, number>;
  earliestShipDate: string | null;
  latestShipDate: string | null;
}

export type DemandImportResult = ImportResult<DemandRecord, DemandImportControlTotals>;

function resolveProduct(products: Product[], raw: string, mapping: DemandCsvMapping): Product | undefined {
  const key = raw.trim();
  if (mapping.productMatch === "id") return products.find(product => product.id === key);
  if (mapping.productMatch === "name") return products.find(product => product.name === key);
  const externalKey = mapping.productExternalKey;
  if (!externalKey) throw new Error("productExternalKey is required when productMatch=externalKey");
  return products.find(product => product.externalKeys?.[externalKey] === key);
}

function parseDemandClass(value: string): DemandRecord["demandClass"] | null {
  const normalized = value.trim().toLowerCase();
  return normalized === "firm" || normalized === "forecast" || normalized === "upside" || normalized === "downside"
    ? normalized
    : null;
}

export function importDemandCsv(
  csv: string,
  products: Product[],
  scenarioId: string,
  mapping: DemandCsvMapping,
): DemandImportResult {
  const table = parseCsvTable(csv, mapping.delimiter ?? ",");
  const missingHeaders = requiredHeaders(table.headers, [
    mapping.productColumn,
    mapping.shipDateColumn,
    mapping.quantityColumn,
    mapping.demandClassColumn,
    mapping.customerOrProgramColumn,
    mapping.sourceRecordIdColumn,
  ]);
  if (missingHeaders.length > 0) throw new Error(`CSV is missing mapped columns: ${missingHeaders.join(", ")}`);

  const records: DemandRecord[] = [];
  const issues: ImportIssue[] = [];
  const issuesByRow = new Map<number, ImportIssue[]>();
  const quantityByProduct: Record<string, number> = {};
  let totalQuantity = 0;
  let earliestShipDate: string | null = null;
  let latestShipDate: string | null = null;

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowIssues: ImportIssue[] = [];
    const productRaw = textValue(row, mapping.productColumn, mapping);
    const product = resolveProduct(products, productRaw, mapping);
    if (!product) rowIssues.push({ rowNumber, severity: "error", code: "PRODUCT_NOT_FOUND", message: `No product matched '${productRaw}'`, column: mapping.productColumn, value: productRaw });

    const dateRaw = textValue(row, mapping.shipDateColumn, mapping);
    const shipDate = parseIsoDate(dateRaw, mapping.dateFormat ?? "iso");
    if (!shipDate) rowIssues.push({ rowNumber, severity: "error", code: "SHIP_DATE_INVALID", message: `Invalid ship date '${dateRaw}'`, column: mapping.shipDateColumn, value: dateRaw });

    const quantityRaw = textValue(row, mapping.quantityColumn, mapping);
    const quantity = parseNumber(quantityRaw);
    if (quantity === null || quantity < 0) rowIssues.push({ rowNumber, severity: "error", code: "QUANTITY_INVALID", message: `Invalid nonnegative quantity '${quantityRaw}'`, column: mapping.quantityColumn, value: quantityRaw });

    let demandClass = mapping.defaultDemandClass;
    if (mapping.demandClassColumn) {
      const classRaw = textValue(row, mapping.demandClassColumn, mapping);
      const parsed = parseDemandClass(classRaw);
      if (classRaw && !parsed) rowIssues.push({ rowNumber, severity: "error", code: "DEMAND_CLASS_INVALID", message: `Invalid demand class '${classRaw}'`, column: mapping.demandClassColumn, value: classRaw });
      else if (parsed) demandClass = parsed;
    }

    issuesByRow.set(rowNumber, rowIssues);
    issues.push(...rowIssues);
    if (rowHasError(rowIssues) || !product || !shipDate || quantity === null || quantity < 0) return;

    const sourceRecordId = textValue(row, mapping.sourceRecordIdColumn, mapping);
    const customerOrProgram = textValue(row, mapping.customerOrProgramColumn, mapping);
    records.push({
      id: sourceRecordId ? `import-${scenarioId}-${sourceRecordId}` : `import-${scenarioId}-row-${rowNumber}`,
      scenarioId,
      productId: product.id,
      shipDate,
      quantity,
      ...(demandClass ? { demandClass } : {}),
      ...(customerOrProgram ? { customerOrProgram } : {}),
      ...(mapping.sourceSystem ? { sourceSystem: mapping.sourceSystem } : {}),
      ...(sourceRecordId ? { sourceRecordId } : {}),
    });
    totalQuantity += quantity;
    quantityByProduct[product.id] = (quantityByProduct[product.id] ?? 0) + quantity;
    earliestShipDate = earliestShipDate === null || shipDate < earliestShipDate ? shipDate : earliestShipDate;
    latestShipDate = latestShipDate === null || shipDate > latestShipDate ? shipDate : latestShipDate;
  });

  return {
    records,
    issues,
    controlTotals: {
      inputRows: table.rows.length,
      acceptedRows: records.length,
      rejectedRows: table.rows.length - records.length,
      warningRows: warningRowCount(issuesByRow),
      addedRecords: records.length,
      replacedRecords: 0,
      unchangedRecords: 0,
      totalQuantity,
      quantityByProduct,
      earliestShipDate,
      latestShipDate,
    },
  };
}

export function mergeDemandImport(
  model: CapacityModel,
  scenarioId: string,
  records: DemandRecord[],
  mode: "append" | "replaceScenario" = "replaceScenario",
): CapacityModel {
  if (!model.scenarios.some(scenario => scenario.id === scenarioId)) throw new Error(`Scenario not found: ${scenarioId}`);
  if (records.some(record => record.scenarioId !== scenarioId)) throw new Error("Imported demand contains a different scenarioId");
  const retained = mode === "replaceScenario" ? model.demand.filter(record => record.scenarioId !== scenarioId) : model.demand;
  return { ...model, demand: [...retained, ...records] };
}
