import { describe, expect, it } from "vitest";
import { capacityModelSchema } from "@capacity/domain";
import {
  createFollowUpAssessment,
  createNewAssessment,
  parseAssessmentFile,
  serializeAssessmentSession,
  type StoredAssessment,
} from "./assessmentSession.js";

const model = createNewAssessment({
  name: "Supplier A Capacity Assessment",
  supplierId: "SUP-A",
  supplierName: "Supplier A",
  assessmentDate: "2026-07-20",
  horizonStart: "2026-01-01",
  horizonEnd: "2027-12-31",
  planningGranularity: "month",
});

describe("local assessment lifecycle", () => {
  it("creates a schema-valid starter assessment", () => {
    expect(capacityModelSchema.safeParse(model).success).toBe(true);
    expect(model.metadata).toMatchObject({ assessmentMode: "local", starterTemplate: true });
    expect(model.organization).toHaveLength(1);
    expect(model.calendars).toHaveLength(1);
    expect(model.supplier?.supplierId).toBe("SUP-A");
  });

  it("carries unverified actions forward with their original assessment", () => {
    const priorModel = {
      ...model,
      actionLog: [
        {
          id: "open-action",
          createdAt: "2025-08-01T00:00:00.000Z",
          category: "followUp" as const,
          note: "Provide evidence",
          status: "complete" as const,
        },
        {
          id: "verified-action",
          createdAt: "2025-08-01T00:00:00.000Z",
          category: "followUp" as const,
          note: "Already checked",
          status: "verified" as const,
          verifiedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const prior = {
      assessmentId: "assessment-prior",
      supplierId: "SUP-A",
      supplierName: "Supplier A",
      assessmentDate: "2025-08-01",
      savedAt: "2025-08-01T12:00:00.000Z",
      openActionCount: 1,
      session: {
        sessionSchemaVersion: "1.0.0" as const,
        savedAt: "2025-08-01T12:00:00.000Z",
        origin: "new" as const,
        activeStep: "decision",
        experience: "guided" as const,
        model: priorModel,
        calculation: null,
        comparison: null,
      },
    } satisfies StoredAssessment;
    const followUp = createFollowUpAssessment(
      {
        name: "June follow-up",
        supplierId: "SUP-A",
        supplierName: "Supplier A",
        assessmentDate: "2026-06-01",
        horizonStart: "2026-06-01",
        horizonEnd: "2027-06-01",
        planningGranularity: "month",
      },
      prior,
      { carryActions: true, reuseModel: true },
    );
    expect(followUp.actionLog).toHaveLength(1);
    expect(followUp.actionLog?.[0]).toMatchObject({
      id: "open-action",
      createdAt: "2025-08-01T00:00:00.000Z",
      raisedInAssessmentId: "assessment-prior",
      supplierId: "SUP-A",
    });
  });

  it("round-trips a working assessment file", () => {
    const content = serializeAssessmentSession({
      sessionSchemaVersion: "1.0.0",
      savedAt: "2026-07-20T12:00:00.000Z",
      origin: "new",
      activeStep: "data",
      experience: "guided",
      model,
      calculation: null,
      comparison: null,
    });
    const opened = parseAssessmentFile(content);
    expect(opened.model).toEqual(model);
    expect(opened.calculation).toBeNull();
    expect(opened.comparison).toBeNull();
  });

  it("preserves indirect resource classification when a working file is saved and reopened", () => {
    const modelWithIndirectResource = structuredClone(model);
    modelWithIndirectResource.resourceGroups[0]!.indirect = true;

    const content = serializeAssessmentSession({
      sessionSchemaVersion: "1.0.0",
      savedAt: "2026-07-20T12:00:00.000Z",
      origin: "new",
      activeStep: "data",
      experience: "guided",
      model: modelWithIndirectResource,
      calculation: null,
      comparison: null,
    });

    const opened = parseAssessmentFile(content);
    expect(opened.model.resourceGroups[0]?.indirect).toBe(true);
  });

  it("reopens a decision evidence package assessment snapshot", () => {
    const content = JSON.stringify({
      packageSchemaVersion: "1.0.0",
      assessmentSnapshot: { model, comparison: null },
    });
    expect(parseAssessmentFile(content).model.modelId).toBe(model.modelId);
  });

  it("rejects malformed or non-assessment JSON", () => {
    expect(() => parseAssessmentFile("not-json")).toThrow(/valid JSON/);
    expect(() => parseAssessmentFile(JSON.stringify({ hello: "world" }))).toThrow();
  });
});
