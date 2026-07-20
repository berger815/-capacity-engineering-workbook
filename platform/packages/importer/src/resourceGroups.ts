import type {
  CapacityModel,
  CapacityUnit,
  ResourceGroup,
  ResourceKind,
} from "@capacity/domain";
import { parseCsvTable } from "./csv.js";
import {
  type BaseImportControlTotals,
  type BaseImportMapping,
  type ImportIssue,
  type ImportResult,
  type MergeMode,
  mergeById,
  parseBoolean,
  requiredHeaders,
  rowHasError,
  textValue,
  warningRowCount,
} from "./shared.js";

const resourceKinds: ResourceKind[] = [
  "labor",
  "equipment",
  "skill",
  "tooling",
  "space",
  "external",
  "other",
];
const capacityUnits: CapacityUnit[] = [
  "hours",
  "units",
  "squareFeet",
  "palletPositions",
  "custom",
];

export interface ResourceGroupCsvMapping extends BaseImportMapping {
  resourceGroupIdColumn: string;
  resourceGroupNameColumn: string;
  resourceKindColumn: string;
  capacityUnitColumn: string;
  calendarIdColumn: string;
  organizationNodeColumn?: string;
  defaultOrganizationNodeId?: string;
  pooledColumn?: string;
  defaultPooled?: boolean;
  indirectColumn?: string;
  defaultIndirect?: boolean;
  tagsColumn?: string;
  externalKeyColumn?: string;
  externalKeyName?: string;
}

export interface ResourceGroupImportControlTotals
  extends BaseImportControlTotals {
  totalResourceGroups: number;
  countByKind: Partial<Record<ResourceKind, number>>;
}

export type ResourceGroupImportResult = ImportResult<
  ResourceGroup,
  ResourceGroupImportControlTotals
>;

export function importResourceGroupsCsv(
  csv: string,
  model: CapacityModel,
  mapping: ResourceGroupCsvMapping,
  mode: MergeMode = "replaceById",
): ResourceGroupImportResult {
  const table = parseCsvTable(csv, mapping.delimiter ?? ",");
  const missing = requiredHeaders(table.headers, [
    mapping.resourceGroupIdColumn,
    mapping.resourceGroupNameColumn,
    mapping.resourceKindColumn,
    mapping.capacityUnitColumn,
    mapping.calendarIdColumn,
    mapping.organizationNodeColumn,
    mapping.pooledColumn,
    mapping.tagsColumn,
    mapping.externalKeyColumn,
  ]);
  if (missing.length > 0)
    throw new Error(`CSV is missing mapped columns: ${missing.join(", ")}`);
  if (!mapping.organizationNodeColumn && !mapping.defaultOrganizationNodeId)
    throw new Error(
      "defaultOrganizationNodeId or organizationNodeColumn is required",
    );
  if (mapping.externalKeyColumn && !mapping.externalKeyName)
    throw new Error(
      "externalKeyName is required when externalKeyColumn is mapped",
    );

  const calendars = new Set(model.calendars.map((calendar) => calendar.id));
  const organizations = new Set(model.organization.map((node) => node.id));
  const seenIds = new Set<string>();
  const records: ResourceGroup[] = [];
  const issues: ImportIssue[] = [];
  const issuesByRow = new Map<number, ImportIssue[]>();
  const countByKind: Partial<Record<ResourceKind, number>> = {};

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowIssues: ImportIssue[] = [];
    const id = textValue(row, mapping.resourceGroupIdColumn, mapping);
    const name = textValue(row, mapping.resourceGroupNameColumn, mapping);
    const kindRaw = textValue(row, mapping.resourceKindColumn, mapping);
    const unitRaw = textValue(row, mapping.capacityUnitColumn, mapping);
    const calendarId = textValue(row, mapping.calendarIdColumn, mapping);
    const organizationNodeId = mapping.organizationNodeColumn
      ? textValue(row, mapping.organizationNodeColumn, mapping)
      : (mapping.defaultOrganizationNodeId ?? "");
    const pooledRaw = textValue(row, mapping.pooledColumn, mapping);
    const pooled = parseBoolean(pooledRaw, mapping.defaultPooled ?? true);
    const indirectRaw = textValue(row, mapping.indirectColumn, mapping);
    const indirect = parseBoolean(
      indirectRaw,
      mapping.defaultIndirect ?? false,
    );
    const tagsRaw = textValue(row, mapping.tagsColumn, mapping);
    const externalKey = textValue(row, mapping.externalKeyColumn, mapping);
    const kind = resourceKinds.includes(kindRaw as ResourceKind)
      ? (kindRaw as ResourceKind)
      : null;
    const capacityUnit = capacityUnits.includes(unitRaw as CapacityUnit)
      ? (unitRaw as CapacityUnit)
      : null;

    if (!id)
      rowIssues.push({
        rowNumber,
        severity: "error",
        code: "RESOURCE_GROUP_ID_REQUIRED",
        message: "Resource group ID is required",
        column: mapping.resourceGroupIdColumn,
      });
    if (!name)
      rowIssues.push({
        rowNumber,
        severity: "error",
        code: "RESOURCE_GROUP_NAME_REQUIRED",
        message: "Resource group name is required",
        column: mapping.resourceGroupNameColumn,
      });
    if (id && seenIds.has(id))
      rowIssues.push({
        rowNumber,
        entityKey: id,
        severity: "error",
        code: "RESOURCE_GROUP_ID_DUPLICATE",
        message: `Duplicate resource group ID '${id}'`,
        column: mapping.resourceGroupIdColumn,
        value: id,
      });
    if (!kind)
      rowIssues.push({
        rowNumber,
        severity: "error",
        code: "RESOURCE_KIND_INVALID",
        message: `Invalid resource kind '${kindRaw}'`,
        column: mapping.resourceKindColumn,
        value: kindRaw,
      });
    if (!capacityUnit)
      rowIssues.push({
        rowNumber,
        severity: "error",
        code: "CAPACITY_UNIT_INVALID",
        message: `Invalid capacity unit '${unitRaw}'`,
        column: mapping.capacityUnitColumn,
        value: unitRaw,
      });
    if (!calendars.has(calendarId))
      rowIssues.push({
        rowNumber,
        entityKey: id || undefined,
        severity: "error",
        code: "CALENDAR_UNKNOWN",
        message: `Calendar '${calendarId}' was not found`,
        column: mapping.calendarIdColumn,
        value: calendarId,
      });
    if (!organizations.has(organizationNodeId))
      rowIssues.push({
        rowNumber,
        entityKey: id || undefined,
        severity: "error",
        code: "ORGANIZATION_UNKNOWN",
        message: `Organization node '${organizationNodeId}' was not found`,
        column: mapping.organizationNodeColumn,
        value: organizationNodeId,
      });
    if (pooled === null)
      rowIssues.push({
        rowNumber,
        entityKey: id || undefined,
        severity: "error",
        code: "POOLED_INVALID",
        message: `Invalid pooled value '${pooledRaw}'`,
        column: mapping.pooledColumn,
        value: pooledRaw,
      });
    if (indirect === null)
      rowIssues.push({
        rowNumber,
        entityKey: id || undefined,
        severity: "error",
        code: "INDIRECT_INVALID",
        message: `Invalid indirect value '${indirectRaw}'`,
        column: mapping.indirectColumn,
        value: indirectRaw,
      });

    if (id) seenIds.add(id);
    issuesByRow.set(rowNumber, rowIssues);
    issues.push(...rowIssues);
    if (
      rowHasError(rowIssues) ||
      !id ||
      !name ||
      !kind ||
      !capacityUnit ||
      !organizationNodeId ||
      pooled === null ||
      indirect === null
    )
      return;

    const tags = tagsRaw
      ? tagsRaw
          .split(/[|;]/)
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    const record: ResourceGroup = {
      id,
      name,
      organizationNodeId,
      kind,
      capacityUnit,
      calendarId,
      pooled,
      ...(indirect ? { indirect: true } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(externalKey && mapping.externalKeyName
        ? { externalKeys: { [mapping.externalKeyName]: externalKey } }
        : {}),
    };
    records.push(record);
    countByKind[kind] = (countByKind[kind] ?? 0) + 1;
  });

  const merged = mergeById(model.resourceGroups, records, mode);
  return {
    records,
    issues,
    controlTotals: {
      inputRows: table.rows.length,
      acceptedRows: records.length,
      rejectedRows: table.rows.length - records.length,
      warningRows: warningRowCount(issuesByRow),
      addedRecords: merged.addedRecords,
      replacedRecords: merged.replacedRecords,
      unchangedRecords: merged.unchangedRecords,
      totalResourceGroups: records.length,
      countByKind,
    },
  };
}

export function mergeResourceGroupsImport(
  model: CapacityModel,
  records: ResourceGroup[],
  mode: MergeMode = "replaceById",
): CapacityModel {
  const merged = mergeById(model.resourceGroups, records, mode);
  return { ...model, resourceGroups: merged.records };
}
