import type {
  ApplicabilityState,
  CapacityModel,
  CapacityUnit,
  LeadTimePhase,
  PhaseAllocation,
  Product,
  RequirementValue,
  RoutingOperation,
  RoutingRequirement,
  RoutingRevision,
} from "@capacity/domain";
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
} from "./shared.js";

export type RoutingProductMatch = "id" | "name" | "externalKey";

export interface RoutingCsvMapping extends BaseImportMapping {
  productColumn: string;
  productMatch?: RoutingProductMatch;
  productExternalKey?: string;
  revisionIdColumn: string;
  revisionColumn?: string;
  effectiveFromColumn: string;
  effectiveToColumn?: string;
  dateFormat?: ImportDateFormat;
  phaseIdColumn: string;
  phaseNameColumn: string;
  startWeeksBeforeShipColumn: string;
  endWeeksBeforeShipColumn: string;
  allocationColumn: string;
  operationIdColumn: string;
  operationNameColumn: string;
  operationSequenceColumn: string;
  resourceGroupIdColumn: string;
  requirementStateColumn: string;
  requirementValueColumn?: string;
  setupRequirementStateColumn?: string;
  setupRequirementValueColumn?: string;
  setupQuantityColumn?: string;
  batchSizeColumn?: string;
}

export interface RoutingImportControlTotals extends BaseImportControlTotals {
  revisionCount: number;
  acceptedRevisionCount: number;
  rejectedRevisionCount: number;
  phaseCount: number;
  acceptedPhaseCount: number;
  rejectedPhaseCount: number;
  operationCount: number;
  acceptedOperationCount: number;
  rejectedOperationCount: number;
  requirementCount: number;
  acceptedRequirementCount: number;
  rejectedRequirementCount: number;
}

export type RoutingImportResult = ImportResult<RoutingRevision, RoutingImportControlTotals>;

interface RawRoutingRow {
  rowNumber: number;
  source: Record<string, string>;
  product?: Product;
  revisionSourceId: string;
  revisionId: string;
  revisionName: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  phaseSourceId: string;
  phaseId: string;
  phaseName: string;
  startWeeks: number | null;
  endWeeks: number | null;
  allocation: PhaseAllocation | null;
  operationSourceId: string;
  operationId: string;
  operationName: string;
  sequence: number | null;
  resourceGroupId: string;
  requirementState: ApplicabilityState | null;
  requirementValue: number | null;
  setupState: ApplicabilityState | null;
  setupValue: number | null;
  setupQuantity: number | null;
  batchSize: number | null;
  issues: ImportIssue[];
}

const allocations: PhaseAllocation[] = ["spread", "shiftToStart", "shiftToEnd", "shiftToMidpoint"];
const states: ApplicabilityState[] = ["value", "missing", "notApplicable", "zero"];

function resolveProduct(products: Product[], raw: string, mapping: RoutingCsvMapping): Product | undefined {
  const key = raw.trim();
  const mode = mapping.productMatch ?? "id";
  if (mode === "id") return products.find(product => product.id === key);
  if (mode === "name") return products.find(product => product.name === key);
  if (!mapping.productExternalKey) throw new Error("productExternalKey is required when productMatch=externalKey");
  return products.find(product => product.externalKeys?.[mapping.productExternalKey ?? ""] === key);
}

function parseState(raw: string): ApplicabilityState | null {
  const normalized = raw.trim();
  return states.includes(normalized as ApplicabilityState) ? normalized as ApplicabilityState : null;
}

function requirementValue(
  state: ApplicabilityState,
  value: number | null,
  unit: CapacityUnit,
  sourceSystem: string | undefined,
): RequirementValue {
  return {
    state,
    unit,
    ...(state === "value" ? { value: value ?? 0 } : state === "zero" ? { value: 0 } : {}),
    ...(sourceSystem ? { source: sourceSystem } : {}),
  };
}

function intervalsOverlap(aFrom: string, aTo: string | undefined, bFrom: string, bTo: string | undefined): boolean {
  const aEnd = aTo ?? "9999-12-31";
  const bEnd = bTo ?? "9999-12-31";
  return aFrom <= bEnd && bFrom <= aEnd;
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), value]);
  }
  return groups;
}

export function importRoutingCsv(
  csv: string,
  model: CapacityModel,
  mapping: RoutingCsvMapping,
): RoutingImportResult {
  const table = parseCsvTable(csv, mapping.delimiter ?? ",");
  const missing = requiredHeaders(table.headers, [
    mapping.productColumn,
    mapping.revisionIdColumn,
    mapping.revisionColumn,
    mapping.effectiveFromColumn,
    mapping.effectiveToColumn,
    mapping.phaseIdColumn,
    mapping.phaseNameColumn,
    mapping.startWeeksBeforeShipColumn,
    mapping.endWeeksBeforeShipColumn,
    mapping.allocationColumn,
    mapping.operationIdColumn,
    mapping.operationNameColumn,
    mapping.operationSequenceColumn,
    mapping.resourceGroupIdColumn,
    mapping.requirementStateColumn,
    mapping.requirementValueColumn,
    mapping.setupRequirementStateColumn,
    mapping.setupRequirementValueColumn,
    mapping.setupQuantityColumn,
    mapping.batchSizeColumn,
  ]);
  if (missing.length > 0) throw new Error(`CSV is missing mapped columns: ${missing.join(", ")}`);

  const resourceGroups = new Map(model.resourceGroups.map(group => [group.id, group]));
  const issues: ImportIssue[] = [];
  const parsedRows: RawRoutingRow[] = table.rows.map((row, index) => {
    const rowNumber = index + 2;
    const rowIssues: ImportIssue[] = [];
    const productRaw = textValue(row, mapping.productColumn, mapping);
    const product = resolveProduct(model.products, productRaw, mapping);
    const revisionSourceId = textValue(row, mapping.revisionIdColumn, mapping);
    const revisionName = mapping.revisionColumn ? textValue(row, mapping.revisionColumn, mapping) : revisionSourceId;
    const revisionId = product && revisionSourceId ? `${product.id}:${revisionSourceId}` : revisionSourceId;
    const effectiveFromRaw = textValue(row, mapping.effectiveFromColumn, mapping);
    const effectiveToRaw = textValue(row, mapping.effectiveToColumn, mapping);
    const effectiveFrom = parseIsoDate(effectiveFromRaw, mapping.dateFormat ?? "iso");
    const effectiveTo = effectiveToRaw ? parseIsoDate(effectiveToRaw, mapping.dateFormat ?? "iso") : null;
    const phaseSourceId = textValue(row, mapping.phaseIdColumn, mapping);
    const phaseId = revisionId && phaseSourceId ? `${revisionId}:${phaseSourceId}` : phaseSourceId;
    const phaseName = textValue(row, mapping.phaseNameColumn, mapping);
    const startRaw = textValue(row, mapping.startWeeksBeforeShipColumn, mapping);
    const endRaw = textValue(row, mapping.endWeeksBeforeShipColumn, mapping);
    const startWeeks = parseNumber(startRaw);
    const endWeeks = parseNumber(endRaw);
    const allocationRaw = textValue(row, mapping.allocationColumn, mapping);
    const allocation = allocations.includes(allocationRaw as PhaseAllocation) ? allocationRaw as PhaseAllocation : null;
    const operationSourceId = textValue(row, mapping.operationIdColumn, mapping);
    const operationId = revisionId && operationSourceId ? `${revisionId}:${operationSourceId}` : operationSourceId;
    const operationName = textValue(row, mapping.operationNameColumn, mapping);
    const sequenceRaw = textValue(row, mapping.operationSequenceColumn, mapping);
    const sequence = parseNumber(sequenceRaw);
    const resourceGroupId = textValue(row, mapping.resourceGroupIdColumn, mapping);
    const requirementStateRaw = textValue(row, mapping.requirementStateColumn, mapping);
    const requirementState = parseState(requirementStateRaw);
    const requirementValueRaw = textValue(row, mapping.requirementValueColumn, mapping);
    const parsedRequirementValue = requirementValueRaw ? parseNumber(requirementValueRaw) : null;
    const setupStateRaw = textValue(row, mapping.setupRequirementStateColumn, mapping);
    const setupState = setupStateRaw ? parseState(setupStateRaw) : null;
    const setupValueRaw = textValue(row, mapping.setupRequirementValueColumn, mapping);
    const setupValue = setupValueRaw ? parseNumber(setupValueRaw) : null;
    const setupQuantityRaw = textValue(row, mapping.setupQuantityColumn, mapping);
    const setupQuantity = setupQuantityRaw ? parseNumber(setupQuantityRaw) : null;
    const batchSizeRaw = textValue(row, mapping.batchSizeColumn, mapping);
    const batchSize = batchSizeRaw ? parseNumber(batchSizeRaw) : null;

    if (!product) rowIssues.push({ rowNumber, severity: "error", code: "PRODUCT_UNKNOWN", message: `Product '${productRaw}' was not found`, column: mapping.productColumn, value: productRaw });
    if (!revisionSourceId) rowIssues.push({ rowNumber, severity: "error", code: "REVISION_ID_REQUIRED", message: "Revision ID is required", column: mapping.revisionIdColumn });
    if (!revisionName) rowIssues.push({ rowNumber, severity: "error", code: "REVISION_NAME_REQUIRED", message: "Revision name is required", column: mapping.revisionColumn ?? mapping.revisionIdColumn });
    if (!effectiveFrom) rowIssues.push({ rowNumber, entityKey: revisionId, severity: "error", code: "REVISION_EFFECTIVE_DATE_INVALID", message: `Invalid effectiveFrom '${effectiveFromRaw}'`, column: mapping.effectiveFromColumn, value: effectiveFromRaw });
    if (effectiveToRaw && !effectiveTo) rowIssues.push({ rowNumber, entityKey: revisionId, severity: "error", code: "REVISION_EFFECTIVE_DATE_INVALID", message: `Invalid effectiveTo '${effectiveToRaw}'`, column: mapping.effectiveToColumn, value: effectiveToRaw });
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) rowIssues.push({ rowNumber, entityKey: revisionId, severity: "error", code: "REVISION_EFFECTIVE_RANGE_INVALID", message: "effectiveTo must be on or after effectiveFrom" });
    if (!phaseSourceId) rowIssues.push({ rowNumber, entityKey: revisionId, severity: "error", code: "PHASE_ID_REQUIRED", message: "Phase ID is required", column: mapping.phaseIdColumn });
    if (!phaseName) rowIssues.push({ rowNumber, entityKey: phaseId, severity: "error", code: "PHASE_NAME_REQUIRED", message: "Phase name is required", column: mapping.phaseNameColumn });
    if (startWeeks === null || startWeeks < 0 || endWeeks === null || endWeeks < 0 || startWeeks < endWeeks) rowIssues.push({ rowNumber, entityKey: phaseId, severity: "error", code: "PHASE_RANGE_INVALID", message: `Lead-time phase must have start >= end >= 0; received '${startRaw}' and '${endRaw}'` });
    if (!allocation) rowIssues.push({ rowNumber, entityKey: phaseId, severity: "error", code: "PHASE_ALLOCATION_INVALID", message: `Invalid phase allocation '${allocationRaw}'`, column: mapping.allocationColumn, value: allocationRaw });
    if (!operationSourceId) rowIssues.push({ rowNumber, entityKey: revisionId, severity: "error", code: "OPERATION_ID_REQUIRED", message: "Operation ID is required", column: mapping.operationIdColumn });
    if (!operationName) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "OPERATION_NAME_REQUIRED", message: "Operation name is required", column: mapping.operationNameColumn });
    if (sequence === null || !Number.isInteger(sequence) || sequence < 0) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "OPERATION_SEQUENCE_INVALID", message: `Operation sequence must be a nonnegative integer; received '${sequenceRaw}'`, column: mapping.operationSequenceColumn, value: sequenceRaw });
    const group = resourceGroups.get(resourceGroupId);
    if (!group) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "RESOURCE_GROUP_UNKNOWN", message: `Resource group '${resourceGroupId}' was not found`, column: mapping.resourceGroupIdColumn, value: resourceGroupId });
    if (!requirementState) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "REQUIREMENT_STATE_INVALID", message: `Invalid requirement state '${requirementStateRaw}'`, column: mapping.requirementStateColumn, value: requirementStateRaw });
    if (requirementState === "value" && (parsedRequirementValue === null || parsedRequirementValue < 0)) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "REQUIREMENT_VALUE_REQUIRED", message: `state=value requires a nonnegative requirement value; received '${requirementValueRaw}'`, column: mapping.requirementValueColumn, value: requirementValueRaw });
    if (requirementState !== "value" && parsedRequirementValue !== null && parsedRequirementValue !== 0) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "REQUIREMENT_VALUE_INVALID", message: "Only state=value may carry a non-zero requirement value", column: mapping.requirementValueColumn, value: requirementValueRaw });
    if (setupStateRaw && !setupState) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "SETUP_REQUIREMENT_STATE_INVALID", message: `Invalid setup requirement state '${setupStateRaw}'`, column: mapping.setupRequirementStateColumn, value: setupStateRaw });
    if (setupState === "value" && (setupValue === null || setupValue < 0)) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "SETUP_REQUIREMENT_VALUE_REQUIRED", message: `setup state=value requires a nonnegative value; received '${setupValueRaw}'`, column: mapping.setupRequirementValueColumn, value: setupValueRaw });
    if (setupQuantity !== null && setupQuantity < 0) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "SETUP_QUANTITY_INVALID", message: `setupQuantity must be nonnegative; received '${setupQuantityRaw}'`, column: mapping.setupQuantityColumn, value: setupQuantityRaw });
    if (batchSize !== null && batchSize <= 0) rowIssues.push({ rowNumber, entityKey: operationId, severity: "error", code: "BATCH_SIZE_INVALID", message: `batchSize must be greater than zero; received '${batchSizeRaw}'`, column: mapping.batchSizeColumn, value: batchSizeRaw });

    issues.push(...rowIssues);
    return {
      rowNumber,
      source: row,
      ...(product ? { product } : {}),
      revisionSourceId,
      revisionId,
      revisionName,
      effectiveFrom,
      effectiveTo,
      phaseSourceId,
      phaseId,
      phaseName,
      startWeeks,
      endWeeks,
      allocation,
      operationSourceId,
      operationId,
      operationName,
      sequence,
      resourceGroupId,
      requirementState,
      requirementValue: parsedRequirementValue,
      setupState,
      setupValue,
      setupQuantity,
      batchSize,
      issues: rowIssues,
    };
  });

  const revisionGroups = groupBy(parsedRows, row => row.revisionId || `row-${row.rowNumber}`);
  const records: RoutingRevision[] = [];
  let acceptedPhaseCount = 0;
  let rejectedPhaseCount = 0;
  let acceptedOperationCount = 0;
  let rejectedOperationCount = 0;
  let acceptedRequirementCount = 0;
  let rejectedRequirementCount = 0;
  let acceptedRows = 0;

  for (const [revisionKey, revisionRows] of revisionGroups) {
    const first = revisionRows[0];
    if (!first) continue;
    const revisionLevelCodes = new Set(["PRODUCT_UNKNOWN", "REVISION_ID_REQUIRED", "REVISION_NAME_REQUIRED", "REVISION_EFFECTIVE_DATE_INVALID", "REVISION_EFFECTIVE_RANGE_INVALID"]);
    let revisionRejected = revisionRows.some(row => row.issues.some(issue => revisionLevelCodes.has(issue.code)));

    const consistentFields: Array<[string, (row: RawRoutingRow) => unknown]> = [
      ["product", row => row.product?.id],
      ["revision", row => row.revisionName],
      ["effectiveFrom", row => row.effectiveFrom],
      ["effectiveTo", row => row.effectiveTo],
    ];
    for (const [label, getter] of consistentFields) {
      const values = new Set(revisionRows.map(getter));
      if (values.size > 1) {
        revisionRejected = true;
        issues.push({ entityKey: revisionKey, severity: "error", code: "REVISION_INCONSISTENT", message: `Revision rows disagree on ${label}` });
      }
    }

    if (!revisionRejected && first.product && first.effectiveFrom) {
      const candidates = [...model.routingRevisions, ...records].filter(revision => revision.productId === first.product?.id);
      if (candidates.some(revision => intervalsOverlap(first.effectiveFrom ?? "", first.effectiveTo ?? undefined, revision.effectiveFrom, revision.effectiveTo))) {
        revisionRejected = true;
        issues.push({ entityKey: revisionKey, severity: "error", code: "REVISION_OVERLAP", message: `Revision '${first.revisionName}' overlaps another effective-dated revision for product '${first.product.id}'` });
      }
    }

    if (revisionRejected || !first.product || !first.effectiveFrom || !first.revisionId || !first.revisionName) {
      rejectedRequirementCount += revisionRows.length;
      rejectedOperationCount += new Set(revisionRows.map(row => row.operationId)).size;
      rejectedPhaseCount += new Set(revisionRows.map(row => row.phaseId)).size;
      continue;
    }

    const phaseGroups = groupBy(revisionRows, row => row.phaseId || `row-${row.rowNumber}`);
    const phases: LeadTimePhase[] = [];
    const operations: RoutingOperation[] = [];

    for (const [phaseKey, phaseRows] of phaseGroups) {
      const phaseFirst = phaseRows[0];
      if (!phaseFirst) continue;
      const phaseCodes = new Set(["PHASE_ID_REQUIRED", "PHASE_NAME_REQUIRED", "PHASE_RANGE_INVALID", "PHASE_ALLOCATION_INVALID"]);
      let phaseRejected = phaseRows.some(row => row.issues.some(issue => phaseCodes.has(issue.code)));
      const phaseSignature = new Set(phaseRows.map(row => `${row.phaseName}|${row.startWeeks}|${row.endWeeks}|${row.allocation}`));
      if (phaseSignature.size > 1) {
        phaseRejected = true;
        issues.push({ entityKey: phaseKey, severity: "error", code: "PHASE_INCONSISTENT", message: "Phase rows disagree on name, timing, or allocation" });
      }
      if (phaseRejected || !phaseFirst.phaseId || !phaseFirst.phaseName || phaseFirst.startWeeks === null || phaseFirst.endWeeks === null || !phaseFirst.allocation) {
        rejectedPhaseCount += 1;
        rejectedOperationCount += new Set(phaseRows.map(row => row.operationId)).size;
        rejectedRequirementCount += phaseRows.length;
        continue;
      }

      const operationGroups = groupBy(phaseRows, row => row.operationId || `row-${row.rowNumber}`);
      const phaseOperations: RoutingOperation[] = [];
      for (const [operationKey, operationRows] of operationGroups) {
        const operationFirst = operationRows[0];
        if (!operationFirst) continue;
        const operationCodes = new Set([
          "OPERATION_ID_REQUIRED", "OPERATION_NAME_REQUIRED", "OPERATION_SEQUENCE_INVALID", "RESOURCE_GROUP_UNKNOWN",
          "REQUIREMENT_STATE_INVALID", "REQUIREMENT_VALUE_REQUIRED", "REQUIREMENT_VALUE_INVALID",
          "SETUP_REQUIREMENT_STATE_INVALID", "SETUP_REQUIREMENT_VALUE_REQUIRED", "SETUP_QUANTITY_INVALID", "BATCH_SIZE_INVALID",
        ]);
        let operationRejected = operationRows.some(row => row.issues.some(issue => operationCodes.has(issue.code)));
        const operationSignature = new Set(operationRows.map(row => `${row.operationName}|${row.sequence}|${row.phaseId}`));
        if (operationSignature.size > 1) {
          operationRejected = true;
          issues.push({ entityKey: operationKey, severity: "error", code: "OPERATION_INCONSISTENT", message: "Operation rows disagree on name, sequence, or phase" });
        }
        const resourceIds = operationRows.map(row => row.resourceGroupId).filter(Boolean);
        if (new Set(resourceIds).size !== resourceIds.length) {
          operationRejected = true;
          issues.push({ entityKey: operationKey, severity: "error", code: "REQUIREMENT_DUPLICATE", message: "Operation contains duplicate resource requirements" });
        }

        if (operationRejected || !operationFirst.operationId || !operationFirst.operationName || operationFirst.sequence === null) {
          rejectedOperationCount += 1;
          rejectedRequirementCount += operationRows.length;
          continue;
        }

        const requirements: RoutingRequirement[] = [];
        for (const row of operationRows) {
          const group = resourceGroups.get(row.resourceGroupId);
          if (!group || !row.requirementState) continue;
          requirements.push({
            id: `${row.operationId}:${row.resourceGroupId}`,
            resourceGroupId: row.resourceGroupId,
            requirement: requirementValue(row.requirementState, row.requirementValue, group.capacityUnit, mapping.sourceSystem),
            ...(row.setupQuantity !== null ? { setupQuantity: row.setupQuantity } : {}),
            ...(row.setupState ? { setupRequirement: requirementValue(row.setupState, row.setupValue, group.capacityUnit, mapping.sourceSystem) } : {}),
            ...(row.batchSize !== null ? { batchSize: row.batchSize } : {}),
          });
        }
        if (requirements.length === 0) {
          rejectedOperationCount += 1;
          rejectedRequirementCount += operationRows.length;
          issues.push({ entityKey: operationKey, severity: "error", code: "OPERATION_REQUIREMENTS_EMPTY", message: "Operation has no valid resource requirements" });
          continue;
        }

        phaseOperations.push({
          id: operationFirst.operationId,
          sequence: operationFirst.sequence,
          name: operationFirst.operationName,
          phaseId: phaseFirst.phaseId,
          requirements,
        });
        acceptedOperationCount += 1;
        acceptedRequirementCount += requirements.length;
        acceptedRows += operationRows.length;
      }

      if (phaseOperations.length === 0) {
        rejectedPhaseCount += 1;
        issues.push({ entityKey: phaseKey, severity: "error", code: "PHASE_OPERATIONS_EMPTY", message: "Phase has no valid operations" });
        continue;
      }
      phases.push({
        id: phaseFirst.phaseId,
        name: phaseFirst.phaseName,
        startWeeksBeforeShip: phaseFirst.startWeeks,
        endWeeksBeforeShip: phaseFirst.endWeeks,
        allocation: phaseFirst.allocation,
      });
      operations.push(...phaseOperations);
      acceptedPhaseCount += 1;
    }

    if (phases.length === 0 || operations.length === 0) {
      issues.push({ entityKey: revisionKey, severity: "error", code: "REVISION_CONTENT_EMPTY", message: "Revision has no valid phases and operations" });
      rejectedPhaseCount += phases.length;
      rejectedOperationCount += operations.length;
      continue;
    }

    records.push({
      id: first.revisionId,
      productId: first.product.id,
      revision: first.revisionName,
      effectiveFrom: first.effectiveFrom,
      ...(first.effectiveTo ? { effectiveTo: first.effectiveTo } : {}),
      phases,
      operations,
      ...(mapping.sourceSystem ? { sourceSystem: mapping.sourceSystem } : {}),
      sourceRevision: first.revisionSourceId,
    });
  }

  const revisionCount = revisionGroups.size;
  const phaseCount = new Set(parsedRows.map(row => row.phaseId || `row-${row.rowNumber}`)).size;
  const operationCount = new Set(parsedRows.map(row => row.operationId || `row-${row.rowNumber}`)).size;
  const requirementCount = parsedRows.length;
  return {
    records,
    issues,
    controlTotals: {
      inputRows: table.rows.length,
      acceptedRows,
      rejectedRows: table.rows.length - acceptedRows,
      warningRows: new Set(issues.filter(issue => issue.severity === "warning" && issue.rowNumber !== undefined).map(issue => issue.rowNumber)).size,
      addedRecords: records.length,
      replacedRecords: 0,
      unchangedRecords: 0,
      revisionCount,
      acceptedRevisionCount: records.length,
      rejectedRevisionCount: revisionCount - records.length,
      phaseCount,
      acceptedPhaseCount,
      rejectedPhaseCount: Math.max(rejectedPhaseCount, phaseCount - acceptedPhaseCount),
      operationCount,
      acceptedOperationCount,
      rejectedOperationCount: Math.max(rejectedOperationCount, operationCount - acceptedOperationCount),
      requirementCount,
      acceptedRequirementCount,
      rejectedRequirementCount: Math.max(rejectedRequirementCount, requirementCount - acceptedRequirementCount),
    },
  };
}

export function mergeRoutingImport(model: CapacityModel, records: RoutingRevision[]): CapacityModel {
  const existingIds = new Set(model.routingRevisions.map(revision => revision.id));
  for (const record of records) {
    if (existingIds.has(record.id)) throw new Error(`Routing revision already exists: ${record.id}`);
    const overlaps = model.routingRevisions.some(existing => existing.productId === record.productId && intervalsOverlap(record.effectiveFrom, record.effectiveTo, existing.effectiveFrom, existing.effectiveTo));
    if (overlaps) throw new Error(`Routing revision overlaps an existing revision for product: ${record.productId}`);
  }
  return { ...model, routingRevisions: [...model.routingRevisions, ...records] };
}
