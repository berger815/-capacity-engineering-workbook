import type { CapacityModel, Program } from "@capacity/domain";
import { parseCsvTable } from "./csv.js";
import {
  type BaseImportControlTotals,
  type BaseImportMapping,
  type ImportDateFormat,
  type ImportIssue,
  type ImportResult,
  type MergeMode,
  mergeById,
  parseIsoDate,
  requiredHeaders,
  rowHasError,
  textValue,
  warningRowCount,
} from "./shared.js";

export interface ProgramCsvMapping extends BaseImportMapping {
  programIdColumn: string;
  programNameColumn: string;
  productIdsColumn: string;
  anchorDateColumn: string;
  endDateColumn?: string;
  externalKeyColumn?: string;
  externalKeyName?: string;
  tagsColumn?: string;
  dateFormat?: ImportDateFormat;
}

export interface ProgramImportControlTotals extends BaseImportControlTotals {
  totalPrograms: number;
  totalProductMemberships: number;
}

export type ProgramImportResult = ImportResult<Program, ProgramImportControlTotals>;

export function importProgramsCsv(csv: string, model: CapacityModel, mapping: ProgramCsvMapping, mode: MergeMode = "replaceById"): ProgramImportResult {
  const table = parseCsvTable(csv, mapping.delimiter ?? ",");
  const missing = requiredHeaders(table.headers, [mapping.programIdColumn, mapping.programNameColumn, mapping.productIdsColumn, mapping.anchorDateColumn, mapping.endDateColumn, mapping.externalKeyColumn, mapping.tagsColumn]);
  if (missing.length > 0) throw new Error(`CSV is missing mapped columns: ${missing.join(", ")}`);
  if (mapping.externalKeyColumn && !mapping.externalKeyName) throw new Error("externalKeyName is required when externalKeyColumn is mapped");

  const products = new Set(model.products.map(product => product.id));
  const assigned = new Map((model.programs ?? []).flatMap(program => program.productIds.map(productId => [productId, program.id] as const)));
  const seenIds = new Set<string>();
  const records: Program[] = [];
  const issues: ImportIssue[] = [];
  const issuesByRow = new Map<number, ImportIssue[]>();

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowIssues: ImportIssue[] = [];
    const id = textValue(row, mapping.programIdColumn, mapping);
    const name = textValue(row, mapping.programNameColumn, mapping);
    const productIds = textValue(row, mapping.productIdsColumn, mapping).split(/[|;]/).map(value => value.trim()).filter(Boolean);
    const anchorRaw = textValue(row, mapping.anchorDateColumn, mapping);
    const endRaw = textValue(row, mapping.endDateColumn, mapping);
    const anchorDate = parseIsoDate(anchorRaw, mapping.dateFormat ?? "iso");
    const endDate = endRaw ? parseIsoDate(endRaw, mapping.dateFormat ?? "iso") : null;
    const externalKey = textValue(row, mapping.externalKeyColumn, mapping);
    const tags = textValue(row, mapping.tagsColumn, mapping).split(/[|;]/).map(value => value.trim()).filter(Boolean);

    if (!id) rowIssues.push({ rowNumber, severity: "error", code: "PROGRAM_ID_REQUIRED", message: "Program ID is required", column: mapping.programIdColumn });
    if (!name) rowIssues.push({ rowNumber, severity: "error", code: "PROGRAM_NAME_REQUIRED", message: "Program name is required", column: mapping.programNameColumn });
    if (id && seenIds.has(id)) rowIssues.push({ rowNumber, entityKey: id, severity: "error", code: "PROGRAM_ID_DUPLICATE", message: `Duplicate program ID '${id}'`, column: mapping.programIdColumn, value: id });
    if (!anchorDate) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "PROGRAM_ANCHOR_INVALID", message: `Invalid anchor date '${anchorRaw}'`, column: mapping.anchorDateColumn, value: anchorRaw });
    if (endRaw && !endDate) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "PROGRAM_END_INVALID", message: `Invalid end date '${endRaw}'`, column: mapping.endDateColumn, value: endRaw });
    if (anchorDate && endDate && endDate < anchorDate) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "PROGRAM_RANGE_INVALID", message: "Program end date must be on or after its anchor date" });
    if (new Set(productIds).size !== productIds.length) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "PROGRAM_PRODUCT_DUPLICATE", message: "A product is listed more than once in the program" });
    for (const productId of productIds) {
      if (!products.has(productId)) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "PROGRAM_PRODUCT_UNKNOWN", message: `Product '${productId}' was not found`, column: mapping.productIdsColumn, value: productId });
      const prior = assigned.get(productId);
      if (prior && prior !== id) rowIssues.push({ rowNumber, entityKey: id || undefined, severity: "error", code: "PRODUCT_IN_MULTIPLE_PROGRAMS", message: `Product '${productId}' already belongs to program '${prior}'`, column: mapping.productIdsColumn, value: productId });
    }

    if (id) seenIds.add(id);
    issuesByRow.set(rowNumber, rowIssues);
    issues.push(...rowIssues);
    if (rowHasError(rowIssues) || !id || !name || !anchorDate) return;
    for (const productId of productIds) assigned.set(productId, id);
    records.push({ id, name, productIds, anchorDate, ...(endDate ? { endDate } : {}), ...(externalKey && mapping.externalKeyName ? { externalKeys: { [mapping.externalKeyName]: externalKey } } : {}), ...(tags.length ? { tags } : {}) });
  });

  const merged = mergeById(model.programs ?? [], records, mode);
  return { records, issues, controlTotals: { inputRows: table.rows.length, acceptedRows: records.length, rejectedRows: table.rows.length - records.length, warningRows: warningRowCount(issuesByRow), addedRecords: merged.addedRecords, replacedRecords: merged.replacedRecords, unchangedRecords: merged.unchangedRecords, totalPrograms: records.length, totalProductMemberships: records.reduce((sum, program) => sum + program.productIds.length, 0) } };
}

export function mergeProgramsImport(model: CapacityModel, records: Program[], mode: MergeMode = "replaceById"): CapacityModel {
  const merged = mergeById(model.programs ?? [], records, mode);
  return { ...model, programs: merged.records };
}
