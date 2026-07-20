import { z } from "zod";

const id = z.string().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ratio = z.number().min(0).max(1);

export const capacityUnitSchema = z.enum(["hours","units","squareFeet","palletPositions","custom"]);
export const applicabilityStateSchema = z.enum(["notApplicable","missing","zero","value"]);

export const requirementValueSchema = z.object({
  state: applicabilityStateSchema,
  value: z.number().nonnegative().optional(),
  unit: capacityUnitSchema,
  source: z.string().optional(),
  confidence: z.enum(["high","medium","low","unknown"]).optional(),
}).superRefine((value, ctx) => {
  if (value.state === "value" && value.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "state=value requires a numeric value" });
  }
  if (value.state !== "value" && value.value !== undefined && value.value !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "only state=value may carry a non-zero value" });
  }
});

const organizationNodeSchema = z.object({
  id, name: z.string().min(1),
  type: z.enum(["enterprise","businessUnit","site","area","workCenter"]),
  parentId: id.optional(),
  externalKeys: z.record(z.string()).optional(),
});

const workingCalendarSchema = z.object({
  id, name: z.string().min(1), timezone: z.string().min(1),
  weeklyMinutes: z.record(z.string(), z.number().nonnegative()),
  exceptions: z.array(z.object({ date: isoDate, availableMinutes: z.number().nonnegative(), reason: z.string().optional() })),
});

const resourceGroupSchema = z.object({
  id, name: z.string().min(1), organizationNodeId: id,
  kind: z.enum(["labor","equipment","skill","tooling","space","external","other"]),
  capacityUnit: capacityUnitSchema, calendarId: id, pooled: z.boolean(), indirect: z.boolean().optional(),
  tags: z.array(z.string()).optional(), externalKeys: z.record(z.string()).optional(),
});

const resourceSchema = z.object({
  id, resourceGroupId: id, name: z.string().min(1), quantity: z.number().positive(),
  ratePerAvailableHour: z.number().positive(), availability: ratio, performance: ratio, quality: ratio,
  effectiveFrom: isoDate.optional(), effectiveTo: isoDate.optional(), externalKeys: z.record(z.string()).optional(),
});

const productSchema = z.object({
  id, name: z.string().min(1), family: z.string().optional(), organizationNodeId: id,
  externalKeys: z.record(z.string()).optional(), tags: z.array(z.string()).optional(),
});

const programSchema = z.object({
  id,
  name: z.string().min(1),
  productIds: z.array(id),
  anchorDate: isoDate,
  endDate: isoDate.optional(),
  externalKeys: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
}).superRefine((program, ctx) => {
  if (new Set(program.productIds).size !== program.productIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "program contains duplicate product ids", path: ["productIds"] });
  }
  if (program.endDate && program.endDate < program.anchorDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endDate must be on or after anchorDate", path: ["endDate"] });
  }
});

const leadTimePhaseSchema = z.object({
  id, name: z.string().min(1), startWeeksBeforeShip: z.number().nonnegative(), endWeeksBeforeShip: z.number().nonnegative(),
  allocation: z.enum(["spread","shiftToStart","shiftToEnd","shiftToMidpoint"]),
}).refine(v => v.startWeeksBeforeShip >= v.endWeeksBeforeShip, { message: "startWeeksBeforeShip must be >= endWeeksBeforeShip" });

const routingRequirementSchema = z.object({
  id, resourceGroupId: id, requirement: requirementValueSchema,
  basis: z.enum(["perUnit","perProgram","perPeriod"]).optional(),
  setupQuantity: z.number().nonnegative().optional(), setupRequirement: requirementValueSchema.optional(), batchSize: z.number().positive().optional(),
});

const routingOperationSchema = z.object({
  id, sequence: z.number().int().nonnegative(), name: z.string().min(1), phaseId: id,
  requirements: z.array(routingRequirementSchema), alternateGroup: z.string().optional(),
  minimumBatchSize: z.number().positive().optional(), maximumBatchSize: z.number().positive().optional(),
});

const routingRevisionSchema = z.object({
  id, productId: id, revision: z.string().min(1), effectiveFrom: isoDate, effectiveTo: isoDate.optional(),
  phases: z.array(leadTimePhaseSchema).min(1), operations: z.array(routingOperationSchema).min(1),
  sourceSystem: z.string().optional(), sourceRevision: z.string().optional(),
});

const scenarioSchema = z.object({
  id, name: z.string().min(1), kind: z.enum(["baseline","recovery","sensitivity"]),
  parentScenarioId: id.optional(), createdAt: z.string().datetime(), createdBy: z.string().optional(),
  assumptions: z.record(z.union([z.string(),z.number(),z.boolean()])).optional(),
});

const actionBaseShape = {
  id,
  scenarioId: id,
  name: z.string().min(1),
  included: z.boolean(),
  status: z.enum(["proposed","approved","implemented","rejected"]),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.optional(),
  owner: z.string().optional(),
  rationale: z.string().optional(),
  confidence: z.enum(["high","medium","low","unknown"]).optional(),
  source: z.string().optional(),
};

const resourceQuantityDeltaActionSchema = z.object({
  ...actionBaseShape,
  kind: z.literal("resourceQuantityDelta"),
  resourceId: id,
  quantityDelta: z.number().positive(),
});

const resourceCapacityMultiplierActionSchema = z.object({
  ...actionBaseShape,
  kind: z.literal("resourceCapacityMultiplier"),
  resourceGroupId: id,
  multiplier: z.number().nonnegative(),
});

const demandMultiplierActionSchema = z.object({
  ...actionBaseShape,
  kind: z.literal("demandMultiplier"),
  productId: id.optional(),
  multiplier: z.number().nonnegative(),
});

export const scenarioActionSchema = z.discriminatedUnion("kind", [
  resourceQuantityDeltaActionSchema,
  resourceCapacityMultiplierActionSchema,
  demandMultiplierActionSchema,
]).superRefine((action, ctx) => {
  if (action.effectiveTo && action.effectiveTo < action.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "effectiveTo must be on or after effectiveFrom", path: ["effectiveTo"] });
  }
  if (action.status === "rejected" && action.included) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a rejected action cannot be included in calculation", path: ["included"] });
  }
});

const demandRecordSchema = z.object({
  id, scenarioId: id, productId: id, shipDate: isoDate, quantity: z.number().nonnegative(),
  demandClass: z.enum(["firm","forecast","upside","downside"]).optional(),
  customerOrProgram: z.string().optional(), sourceSystem: z.string().optional(), sourceRecordId: z.string().optional(),
});

const actionStatusSchema = z.enum(["open","inProgress","blocked","complete","verified","cancelled"]);

const actionLogEntrySchema = z.preprocess(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entry = value as Record<string, unknown>;
  if (entry.status !== undefined) return value;
  return { ...entry, status: typeof entry.resolvedAt === "string" ? "complete" : "open" };
}, z.object({
  id,
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(),
  category: z.enum(["data","assumption","risk","decision","followUp","general"]),
  note: z.string().min(1),
  relatedEntityType: z.string().optional(),
  relatedEntityId: id.optional(),
  owner: z.string().optional(),
  dueDate: isoDate.optional(),
  status: actionStatusSchema,
  statusHistory: z.array(z.object({ status: actionStatusSchema, at: z.string().datetime(), by: z.string().optional(), note: z.string().optional() })).optional(),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.string().optional(),
  evidenceNote: z.string().optional(),
  raisedInAssessmentId: id.optional(),
  supplierId: id.optional(),
  resolvedAt: z.string().datetime().optional(),
}).superRefine((entry, ctx) => {
  if (entry.status === "verified" && !entry.verifiedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "verified status requires verifiedAt", path: ["verifiedAt"] });
  }
}));

const supplierRefSchema = z.object({
  supplierId: id,
  supplierName: z.string().min(1),
  site: z.string().optional(),
  externalKeys: z.record(z.string()).optional(),
});

const planningWipRecordSchema = z.object({
  id,
  scenarioId: id,
  productId: id,
  periodStart: isoDate,
  quantity: z.number().nonnegative(),
  basis: z.enum(["estimated","reported","derived"]),
  sourceSystem: z.string().optional(),
  confidence: z.enum(["high","medium","low","unknown"]).optional(),
  notes: z.string().optional(),
});

const footprintPlanSchema = z.object({
  id,
  departmentOrArea: z.string().min(1),
  organizationNodeId: id.optional(),
  calendarId: id.optional(),
  productId: id.optional(),
  productFamily: z.string().optional(),
  dwellWorkingDays: z.number().nonnegative(),
  spacePerUnit: z.number().nonnegative(),
  basis: z.enum(["squareFeet","palletPositions","custom"]),
  availableCapacity: z.number().nonnegative(),
  peakFactor: z.number().positive(),
  source: z.string().optional(),
  confidence: z.enum(["high","medium","low","unknown"]).optional(),
  notes: z.string().optional(),
}).superRefine((plan, ctx) => {
  if (plan.productId && plan.productFamily) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "use either productId or productFamily, not both", path: ["productFamily"] });
  }
});

export const capacityModelSchema = z.object({
  schemaVersion: z.string().min(1), modelId: id, name: z.string().min(1), planningGranularity: z.enum(["week","month"]),
  horizonStart: isoDate, horizonEnd: isoDate,
  organization: z.array(organizationNodeSchema).min(1), calendars: z.array(workingCalendarSchema).min(1),
  resourceGroups: z.array(resourceGroupSchema).min(1), resources: z.array(resourceSchema),
  products: z.array(productSchema).min(1), routingRevisions: z.array(routingRevisionSchema),
  programs: z.array(programSchema).optional(),
  scenarios: z.array(scenarioSchema).min(1), demand: z.array(demandRecordSchema),
  scenarioActions: z.array(scenarioActionSchema).optional(),
  actionLog: z.array(actionLogEntrySchema).optional(),
  footprintPlans: z.array(footprintPlanSchema).optional(),
  planningWip: z.array(planningWipRecordSchema).optional(),
  supplier: supplierRefSchema.optional(),
  assessmentDate: isoDate.optional(),
  metadata: z.record(z.union([z.string(),z.number(),z.boolean()])).optional(),
}).superRefine((model, ctx) => {
  const unique = (values: string[], path: (string | number)[]) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate ids", path });
  };
  unique(model.organization.map(x=>x.id), ["organization"]);
  unique(model.calendars.map(x=>x.id), ["calendars"]);
  unique(model.resourceGroups.map(x=>x.id), ["resourceGroups"]);
  unique(model.resources.map(x=>x.id), ["resources"]);
  unique(model.products.map(x=>x.id), ["products"]);
  unique((model.programs ?? []).map(x=>x.id), ["programs"]);
  unique(model.routingRevisions.map(x=>x.id), ["routingRevisions"]);
  unique(model.scenarios.map(x=>x.id), ["scenarios"]);
  unique(model.demand.map(x=>x.id), ["demand"]);
  unique((model.scenarioActions ?? []).map(x=>x.id), ["scenarioActions"]);
  unique((model.actionLog ?? []).map(x=>x.id), ["actionLog"]);
  unique((model.footprintPlans ?? []).map(x=>x.id), ["footprintPlans"]);
  unique((model.planningWip ?? []).map(x=>x.id), ["planningWip"]);

  const scenarios = new Map(model.scenarios.map(item => [item.id, item]));
  const resources = new Set(model.resources.map(item => item.id));
  const resourceGroups = new Set(model.resourceGroups.map(item => item.id));
  const products = new Set(model.products.map(item => item.id));
  const calendars = new Set(model.calendars.map(item => item.id));
  const organization = new Set(model.organization.map(item => item.id));
  const programByProduct = new Map<string, string>();

  (model.programs ?? []).forEach((program, programIndex) => {
    program.productIds.forEach((productId, productIndex) => {
      if (!products.has(productId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "program product does not exist", path: ["programs", programIndex, "productIds", productIndex] });
      }
      const existing = programByProduct.get(productId);
      if (existing) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `PRODUCT_IN_MULTIPLE_PROGRAMS: product also belongs to ${existing}`, path: ["programs", programIndex, "productIds", productIndex] });
      } else {
        programByProduct.set(productId, program.id);
      }
    });
  });

  model.routingRevisions.forEach((revision, revisionIndex) => {
    const needsProgram = revision.operations.some(operation => operation.requirements.some(requirement => (requirement.basis ?? "perUnit") !== "perUnit"));
    if (needsProgram && !programByProduct.has(revision.productId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PROGRAM_MISSING: non-per-unit requirement requires a program", path: ["routingRevisions", revisionIndex, "productId"] });
    }
  });

  model.scenarios.forEach((scenario, index) => {
    if (scenario.parentScenarioId && !scenarios.has(scenario.parentScenarioId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "parent scenario does not exist", path: ["scenarios", index, "parentScenarioId"] });
    }
    if (scenario.parentScenarioId === scenario.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "scenario cannot parent itself", path: ["scenarios", index, "parentScenarioId"] });
    }
  });

  model.scenarios.forEach((scenario, index) => {
    const visited = new Set<string>();
    let cursor = scenario;
    while (cursor.parentScenarioId) {
      if (visited.has(cursor.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "scenario parent cycle detected", path: ["scenarios", index, "parentScenarioId"] });
        break;
      }
      visited.add(cursor.id);
      const parent = scenarios.get(cursor.parentScenarioId);
      if (!parent) break;
      cursor = parent;
    }
  });

  (model.scenarioActions ?? []).forEach((action, index) => {
    const scenario = scenarios.get(action.scenarioId);
    if (!scenario) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "action scenario does not exist", path: ["scenarioActions", index, "scenarioId"] });
    } else if (scenario.kind === "baseline") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "recovery actions cannot modify a baseline scenario", path: ["scenarioActions", index, "scenarioId"] });
    }

    if (action.kind === "resourceQuantityDelta" && !resources.has(action.resourceId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "action resource does not exist", path: ["scenarioActions", index, "resourceId"] });
    }
    if (action.kind === "resourceCapacityMultiplier" && !resourceGroups.has(action.resourceGroupId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "action resource group does not exist", path: ["scenarioActions", index, "resourceGroupId"] });
    }
    if (action.kind === "demandMultiplier" && action.productId && !products.has(action.productId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "action product does not exist", path: ["scenarioActions", index, "productId"] });
    }
  });

  (model.planningWip ?? []).forEach((record, index) => {
    if (!scenarios.has(record.scenarioId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WIP scenario does not exist", path: ["planningWip", index, "scenarioId"] });
    if (!products.has(record.productId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WIP product does not exist", path: ["planningWip", index, "productId"] });
  });

  (model.footprintPlans ?? []).forEach((plan, index) => {
    if (plan.productId && !products.has(plan.productId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "footprint product does not exist", path: ["footprintPlans", index, "productId"] });
    if (plan.calendarId && !calendars.has(plan.calendarId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "footprint calendar does not exist", path: ["footprintPlans", index, "calendarId"] });
    if (plan.organizationNodeId && !organization.has(plan.organizationNodeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "footprint organization node does not exist", path: ["footprintPlans", index, "organizationNodeId"] });
  });
});

export type CapacityModelInput = z.input<typeof capacityModelSchema>;
