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

export interface WorkbenchTarget {
  entity: WorkbenchEntity;
  recordId?: string;
  parentRecordId?: string;
  returnTo?: {
    step: "scope" | "data" | "readiness" | "analysis" | "capacity" | "footprint" | "recovery" | "actions" | "decision";
    label: string;
    view?: string;
    resourceGroupId?: string;
    periodStart?: string;
  };
}

export interface WorkbenchEntityDefinition {
  id: WorkbenchEntity;
  label: string;
  note: string;
  count: (model: CapacityModel) => number;
  scopes: WorkbenchScope[];
  inputEntity?: InputEntity;
  dependencies?: InputEntity[];
  profile?: { id: string; label: string; mapping: Record<string, unknown> };
  exportCsv?: (model: CapacityModel, scenarioId: string) => string;
}

export const workbenchEntities: WorkbenchEntityDefinition[] = [
  {
    id: "products",
    label: "Products",
    note: "Canonical product IDs, names, families, and aliases",
    count: model => model.products.length,
    scopes: ["all", "core-data"],
    inputEntity: "products",
    dependencies: [],
    profile: genericProductProfile as unknown as WorkbenchEntityDefinition["profile"],
    exportCsv: model => exportProductsCsv(model),
  },
  {
    id: "calendars",
    label: "Calendars",
    note: "Weekly availability and dated exceptions",
    count: model => model.calendars.length,
    scopes: ["all", "core-data"],
    inputEntity: "calendars",
    dependencies: [],
    profile: genericCalendarProfile as unknown as WorkbenchEntityDefinition["profile"],
    exportCsv: model => exportCalendarsCsv(model),
  },
  {
    id: "resource-groups",
    label: "Resource Groups",
    note: "Constraint class, capacity unit, calendar, and ownership",
    count: model => model.resourceGroups.length,
    scopes: ["all", "core-data"],
    inputEntity: "resource-groups",
    dependencies: ["calendars"],
    profile: genericResourceGroupProfile as unknown as WorkbenchEntityDefinition["profile"],
    exportCsv: model => exportResourceGroupsCsv(model),
  },
  {
    id: "resources",
    label: "Resources",
    note: "Effective quantity, conversion rate, and OEE factors",
    count: model => model.resources.length,
    scopes: ["all", "core-data"],
    inputEntity: "resources",
    dependencies: ["calendars", "resource-groups"],
    profile: genericResourceProfile as unknown as WorkbenchEntityDefinition["profile"],
    exportCsv: model => exportResourcesCsv(model),
  },
  {
    id: "routing",
    label: "Routing",
    note: "Revisions, phases, operations, and sparse requirements",
    count: model => model.routingRevisions.length,
    scopes: ["all", "core-data"],
    inputEntity: "routing",
    dependencies: ["products", "resource-groups"],
    profile: genericRoutingProfile as unknown as WorkbenchEntityDefinition["profile"],
    exportCsv: model => exportRoutingCsv({ ...model, routingRevisions: [] }),
  },
  {
    id: "demand",
    label: "Demand",
    note: "Product, ship date, quantity, and demand class",
    count: model => model.demand.length,
    scopes: ["all", "core-data"],
    inputEntity: "demand",
    dependencies: ["products"],
    profile: genericDemandProfile as unknown as WorkbenchEntityDefinition["profile"],
    exportCsv: (model, scenarioId) => exportDemandCsv(model, scenarioId),
  },
  {
    id: "footprint",
    label: "Footprint / WIP",
    note: "Dwell, space per unit, available area, and planning WIP",
    count: model => (model.footprintPlans?.length ?? 0) + (model.planningWip?.length ?? 0),
    scopes: ["all", "footprint"],
  },
  {
    id: "actions",
    label: "Action Log",
    note: "Data gaps, assumptions, risks, decisions, and follow-up",
    count: model => model.actionLog?.length ?? 0,
    scopes: ["all", "actions"],
  },
];

export function entityDefinition(entity: WorkbenchEntity): WorkbenchEntityDefinition {
  return workbenchEntities.find(item => item.id === entity) ?? workbenchEntities[0]!;
}

export function entitiesForScope(scope: WorkbenchScope): WorkbenchEntityDefinition[] {
  return workbenchEntities.filter(item => item.scopes.includes(scope));
}

export function dependencyCount(model: CapacityModel, entity: InputEntity): number {
  const definition = workbenchEntities.find(item => item.inputEntity === entity);
  return definition?.count(model) ?? 0;
}

export function calendarExceptionsCsv(model: CapacityModel): string {
  return exportCalendarExceptionsCsv(model);
}
