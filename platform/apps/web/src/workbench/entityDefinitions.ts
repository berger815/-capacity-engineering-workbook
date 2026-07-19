import type { CapacityModel } from "@capacity/domain";
import {
  exportCalendarExceptionsCsv,
  exportCalendarsCsv,
  exportDemandCsv,
  exportProductsCsv,
  exportResourceGroupsCsv,
  exportResourcesCsv,
  exportRoutingCsv,
  genericCalendarProfile,
  genericDemandProfile,
  genericProductProfile,
  genericResourceGroupProfile,
  genericResourceProfile,
  genericRoutingProfile,
} from "@capacity/importer";
import type { InputEntity } from "../inputApi.js";

export type WorkbenchEntity =
  | "products"
  | "calendars"
  | "resource-groups"
  | "resources"
  | "routing"
  | "demand"
  | "footprint"
  | "actions";

export type WorkbenchScope = "all" | "core-data" | "footprint" | "actions";

export interface WorkbenchReturnContext {
  step: "scope" | "data" | "readiness" | "analysis" | "capacity" | "footprint" | "recovery" | "actions" | "decision";
  label: string;
  view?: string;
  resourceGroupId?: string;
  periodStart?: string;
}

export interface WorkbenchTarget {
  entity: WorkbenchEntity;
  recordId?: string;
  parentRecordId?: string;
  returnTo?: WorkbenchReturnContext;
}

export interface EntityDefinition {
  id: WorkbenchEntity;
  label: string;
  shortLabel: string;
  note: string;
  count: (model: CapacityModel, scenarioId: string) => number;
  scopes: WorkbenchScope[];
  inputEntity?: InputEntity;
  dependencies?: InputEntity[];
  profile?: { id: string; label: string; mapping: Record<string, unknown> };
  exportCsv?: (model: CapacityModel, scenarioId: string) => string;
  exceptionExportCsv?: (model: CapacityModel) => string;
}

export const entityDefinitions: EntityDefinition[] = [
  {
    id: "products",
    label: "Products",
    shortLabel: "Products",
    note: "Canonical product IDs, families, and external keys",
    count: model => model.products.length,
    scopes: ["all", "core-data"],
    inputEntity: "products",
    dependencies: [],
    profile: genericProductProfile as unknown as NonNullable<EntityDefinition["profile"]>,
    exportCsv: model => exportProductsCsv(model),
  },
  {
    id: "calendars",
    label: "Working Calendars",
    shortLabel: "Calendars",
    note: "Weekly availability and date exceptions",
    count: model => model.calendars.length,
    scopes: ["all", "core-data"],
    inputEntity: "calendars",
    dependencies: [],
    profile: genericCalendarProfile as unknown as NonNullable<EntityDefinition["profile"]>,
    exportCsv: model => exportCalendarsCsv(model),
    exceptionExportCsv: model => exportCalendarExceptionsCsv(model),
  },
  {
    id: "resource-groups",
    label: "Resource Groups",
    shortLabel: "Resource Groups",
    note: "Constraint class, unit, calendar, organization, and pooling",
    count: model => model.resourceGroups.length,
    scopes: ["all", "core-data"],
    inputEntity: "resource-groups",
    dependencies: ["calendars"],
    profile: genericResourceGroupProfile as unknown as NonNullable<EntityDefinition["profile"]>,
    exportCsv: model => exportResourceGroupsCsv(model),
  },
  {
    id: "resources",
    label: "Resources",
    shortLabel: "Resources",
    note: "Effective quantity, capacity conversion, and OEE factors",
    count: model => model.resources.length,
    scopes: ["all", "core-data"],
    inputEntity: "resources",
    dependencies: ["calendars", "resource-groups"],
    profile: genericResourceProfile as unknown as NonNullable<EntityDefinition["profile"]>,
    exportCsv: model => exportResourcesCsv(model),
  },
  {
    id: "routing",
    label: "Routing Revisions",
    shortLabel: "Routing",
    note: "Effective revisions, phases, operations, and sparse requirements",
    count: model => model.routingRevisions.length,
    scopes: ["all", "core-data"],
    inputEntity: "routing",
    dependencies: ["products", "resource-groups"],
    profile: genericRoutingProfile as unknown as NonNullable<EntityDefinition["profile"]>,
    exportCsv: model => exportRoutingCsv({ ...model, routingRevisions: [] }),
  },
  {
    id: "demand",
    label: "Demand",
    shortLabel: "Demand",
    note: "Product, ship date, quantity, class, and program",
    count: (model, scenarioId) => model.demand.filter(record => record.scenarioId === scenarioId).length,
    scopes: ["all", "core-data"],
    inputEntity: "demand",
    dependencies: ["products"],
    profile: genericDemandProfile as unknown as NonNullable<EntityDefinition["profile"]>,
    exportCsv: (model, scenarioId) => exportDemandCsv(model, scenarioId),
  },
  {
    id: "footprint",
    label: "Footprint & WIP",
    shortLabel: "Footprint / WIP",
    note: "Dwell, concurrent occupancy, space per unit, and reported WIP",
    count: model => (model.footprintPlans?.length ?? 0) + (model.planningWip?.length ?? 0),
    scopes: ["all", "footprint"],
  },
  {
    id: "actions",
    label: "Action Log",
    shortLabel: "Action Log",
    note: "Assessment data gaps, assumptions, risks, decisions, and follow-up",
    count: model => model.actionLog?.length ?? 0,
    scopes: ["all", "actions"],
  },
];

export function definitionsForScope(scope: WorkbenchScope): EntityDefinition[] {
  return entityDefinitions.filter(definition => definition.scopes.includes(scope));
}

export function definitionForEntity(entity: WorkbenchEntity): EntityDefinition {
  return entityDefinitions.find(definition => definition.id === entity) ?? entityDefinitions[0]!;
}

export function dependencyCount(model: CapacityModel, entity: InputEntity): number {
  switch (entity) {
    case "calendars": return model.calendars.length;
    case "resource-groups": return model.resourceGroups.length;
    case "resources": return model.resources.length;
    case "products": return model.products.length;
    case "routing": return model.routingRevisions.length;
    case "demand": return model.demand.length;
  }
}
