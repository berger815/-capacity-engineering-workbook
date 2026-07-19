import type { CapacityModel, Product } from "@capacity/domain";
import { parseCsvTable } from "./csv.js";
import {
  type BaseImportControlTotals,
  type BaseImportMapping,
  type ImportIssue,
  type ImportResult,
  type MergeMode,
  mergeById,
  requiredHeaders,
  rowHasError,
  textValue,
  warningRowCount,
} from "./shared.js";

export interface ProductCsvMapping extends BaseImportMapping {
  productIdColumn: string;
  productNameColumn: string;
  externalKeyColumn?: string;
  externalKeyName?: string;
  productFamilyColumn?: string;
  organizationNodeColumn?: string;
  defaultOrganizationNodeId?: string;
}

export interface ProductImportControlTotals extends BaseImportControlTotals {
  totalProducts: number;
}

export type ProductImportResult = ImportResult<Product, ProductImportControlTotals>;

export function importProductsCsv(
  csv: string,
  model: CapacityModel,
  mapping: ProductCsvMapping,
  mode: MergeMode = "replaceById",
): ProductImportResult {
  const table = parseCsvTable(csv, mapping.delimiter ?? ",");
  const missing = requiredHeaders(table.headers, [
    mapping.productIdColumn,
    mapping.productNameColumn,
    mapping.externalKeyColumn,
    mapping.productFamilyColumn,
    mapping.organizationNodeColumn,
  ]);
  if (missing.length > 0) throw new Error(`CSV is missing mapped columns: ${missing.join(", ")}`);
  if (!mapping.organizationNodeColumn && !mapping.defaultOrganizationNodeId) {
    throw new Error("defaultOrganizationNodeId or organizationNodeColumn is required");
  }
  if (mapping.externalKeyColumn && !mapping.externalKeyName) {
    throw new Error("externalKeyName is required when externalKeyColumn is mapped");
  }

  const records: Product[] = [];
  const issues: ImportIssue[] = [];
  const issuesByRow = new Map<number, ImportIssue[]>();
  const seenIds = new Set<string>();
  const seenExternal = new Map<string, string>();
  const existingExternal = new Map<string, string>();
  if (mapping.externalKeyName) {
    for (const product of model.products) {
      const value = product.externalKeys?.[mapping.externalKeyName];
      if (value) existingExternal.set(value, product.id);
    }
  }
  const organizations = new Set(model.organization.map(node => node.id));

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowIssues: ImportIssue[] = [];
    const id = textValue(row, mapping.productIdColumn, mapping);
    const name = textValue(row, mapping.productNameColumn, mapping);
    const family = textValue(row, mapping.productFamilyColumn, mapping);
    const organizationNodeId = mapping.organizationNodeColumn
      ? textValue(row, mapping.organizationNodeColumn, mapping)
      : mapping.defaultOrganizationNodeId ?? "";
    const externalKey = textValue(row, mapping.externalKeyColumn, mapping);

    if (!id) rowIssues.push({ rowNumber, severity: "error", code: "PRODUCT_ID_REQUIRED", message: "Product ID is required", column: mapping.productIdColumn });
    if (!name) rowIssues.push({ rowNumber, severity: "error", code: "PRODUCT_NAME_REQUIRED", message: "Product name is required", column: mapping.productNameColumn });
    if (id && seenIds.has(id)) rowIssues.push({ rowNumber, entityKey: id, severity: "error", code: "PRODUCT_ID_DUPLICATE", message: `Duplicate product ID '${id}'`, column: mapping.productIdColumn, value: id });
    if (organizationNodeId && !organizations.has(organizationNodeId)) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "ORGANIZATION_UNKNOWN", message: `Organization node '${organizationNodeId}' was not found`, column: mapping.organizationNodeColumn, value: organizationNodeId });

    if (externalKey) {
      const priorInput = seenExternal.get(externalKey);
      const priorExisting = existingExternal.get(externalKey);
      if (priorInput && priorInput !== id) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "EXTERNAL_KEY_DUPLICATE", message: `External key '${externalKey}' is already used by '${priorInput}'`, column: mapping.externalKeyColumn, value: externalKey });
      if (priorExisting && priorExisting !== id) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "EXTERNAL_KEY_DUPLICATE", message: `External key '${externalKey}' is already used by existing product '${priorExisting}'`, column: mapping.externalKeyColumn, value: externalKey });
    }

    if (id) seenIds.add(id);
    if (externalKey && id) seenExternal.set(externalKey, id);
    issuesByRow.set(rowNumber, rowIssues);
    issues.push(...rowIssues);
    if (rowHasError(rowIssues) || !id || !name || !organizationNodeId) return;

    records.push({
      id,
      name,
      organizationNodeId,
      ...(family ? { family } : {}),
      ...(externalKey && mapping.externalKeyName ? { externalKeys: { [mapping.externalKeyName]: externalKey } } : {}),
    });
  });

  let mergedStats = { addedRecords: 0, replacedRecords: 0, unchangedRecords: 0 };
  try {
    mergedStats = mergeById(model.products, records, mode);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Product merge failed");
  }

  return {
    records,
    issues,
    controlTotals: {
      inputRows: table.rows.length,
      acceptedRows: records.length,
      rejectedRows: table.rows.length - records.length,
      warningRows: warningRowCount(issuesByRow),
      ...mergedStats,
      totalProducts: records.length,
    },
  };
}

export function mergeProductsImport(model: CapacityModel, records: Product[], mode: MergeMode = "replaceById"): CapacityModel {
  const merged = mergeById(model.products, records, mode);
  return { ...model, products: merged.records };
}
