import type { BaseImportMapping } from "./shared.js";
import type { CalendarCsvMapping, CalendarExceptionCsvMapping } from "./calendars.js";
import type { DemandCsvMapping } from "./demand.js";
import type { ProductCsvMapping } from "./products.js";
import type { ResourceGroupCsvMapping } from "./resourceGroups.js";
import type { ResourceCsvMapping } from "./resources.js";
import type { RoutingCsvMapping } from "./routing.js";

export type ImportEntity = "calendars" | "calendarExceptions" | "resourceGroups" | "resources" | "products" | "routing" | "demand";

export interface SourceProfile<TMapping extends BaseImportMapping> {
  id: string;
  version: number;
  entity: ImportEntity;
  label: string;
  sourceSystem: string;
  mapping: TMapping;
  preprocess?: (raw: string) => string;
}

export interface SavedSourceProfile<TMapping extends BaseImportMapping> extends SourceProfile<TMapping> {
  createdAt: string;
  updatedAt: string;
}

export const genericCalendarProfile: SourceProfile<CalendarCsvMapping> = {
  id: "generic-calendar-v1",
  version: 1,
  entity: "calendars",
  label: "Generic calendar CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    calendarIdColumn: "calendarId",
    calendarNameColumn: "calendarName",
    timezoneColumn: "timezone",
    monMinutesColumn: "monMinutes",
    tueMinutesColumn: "tueMinutes",
    wedMinutesColumn: "wedMinutes",
    thuMinutesColumn: "thuMinutes",
    friMinutesColumn: "friMinutes",
    satMinutesColumn: "satMinutes",
    sunMinutesColumn: "sunMinutes",
  },
};

export const genericCalendarExceptionProfile: SourceProfile<CalendarExceptionCsvMapping> = {
  id: "generic-calendar-exception-v1",
  version: 1,
  entity: "calendarExceptions",
  label: "Generic calendar exception CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    calendarIdColumn: "calendarId",
    exceptionDateColumn: "exceptionDate",
    availableMinutesColumn: "availableMinutes",
    reasonColumn: "reason",
    dateFormat: "iso",
  },
};

export const genericResourceGroupProfile: SourceProfile<ResourceGroupCsvMapping> = {
  id: "generic-resource-group-v1",
  version: 1,
  entity: "resourceGroups",
  label: "Generic resource group CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    resourceGroupIdColumn: "resourceGroupId",
    resourceGroupNameColumn: "resourceGroupName",
    resourceKindColumn: "resourceKind",
    capacityUnitColumn: "capacityUnit",
    calendarIdColumn: "calendarId",
    organizationNodeColumn: "organizationNodeId",
    pooledColumn: "pooled",
    tagsColumn: "tags",
  },
};

export const genericResourceProfile: SourceProfile<ResourceCsvMapping> = {
  id: "generic-resource-v1",
  version: 1,
  entity: "resources",
  label: "Generic resource CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    resourceIdColumn: "resourceId",
    resourceNameColumn: "resourceName",
    resourceGroupIdColumn: "resourceGroupId",
    calendarIdColumn: "calendarId",
    quantityColumn: "quantity",
    ratePerAvailableHourColumn: "ratePerAvailableHour",
    availabilityColumn: "availability",
    performanceColumn: "performance",
    qualityColumn: "quality",
    effectiveFromColumn: "effectiveFrom",
    effectiveToColumn: "effectiveTo",
    dateFormat: "iso",
    factorFormat: "decimal",
  },
};

export const genericProductProfile: SourceProfile<ProductCsvMapping> = {
  id: "generic-product-v1",
  version: 1,
  entity: "products",
  label: "Generic product CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    productIdColumn: "productId",
    productNameColumn: "productName",
    externalKeyColumn: "externalKey",
    externalKeyName: "source",
    productFamilyColumn: "productFamily",
    organizationNodeColumn: "organizationNodeId",
  },
};

export const genericRoutingProfile: SourceProfile<RoutingCsvMapping> = {
  id: "generic-routing-v1",
  version: 1,
  entity: "routing",
  label: "Generic routing CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    productColumn: "productId",
    productMatch: "id",
    revisionIdColumn: "revisionId",
    revisionColumn: "revision",
    effectiveFromColumn: "effectiveFrom",
    effectiveToColumn: "effectiveTo",
    dateFormat: "iso",
    phaseIdColumn: "phaseId",
    phaseNameColumn: "phaseName",
    startWeeksBeforeShipColumn: "startWeeksBeforeShip",
    endWeeksBeforeShipColumn: "endWeeksBeforeShip",
    allocationColumn: "allocation",
    operationIdColumn: "operationId",
    operationNameColumn: "operationName",
    operationSequenceColumn: "operationSequence",
    resourceGroupIdColumn: "resourceGroupId",
    requirementStateColumn: "requirementState",
    requirementValueColumn: "requirementValue",
    setupRequirementStateColumn: "setupRequirementState",
    setupRequirementValueColumn: "setupRequirementValue",
    setupQuantityColumn: "setupQuantity",
    batchSizeColumn: "batchSize",
  },
};

export const genericDemandProfile: SourceProfile<DemandCsvMapping> = {
  id: "generic-demand-v1",
  version: 1,
  entity: "demand",
  label: "Generic demand CSV",
  sourceSystem: "Generic CSV",
  mapping: {
    sourceSystem: "Generic CSV",
    productColumn: "productId",
    shipDateColumn: "shipDate",
    quantityColumn: "quantity",
    productMatch: "id",
    dateFormat: "iso",
    demandClassColumn: "demandClass",
    customerOrProgramColumn: "customerOrProgram",
    sourceRecordIdColumn: "sourceRecordId",
  },
};

export const genericSourceProfiles = [
  genericCalendarProfile,
  genericCalendarExceptionProfile,
  genericResourceGroupProfile,
  genericResourceProfile,
  genericProductProfile,
  genericRoutingProfile,
  genericDemandProfile,
] as const;
