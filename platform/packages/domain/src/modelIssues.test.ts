import { describe, expect, it } from "vitest";
import type { CapacityModel } from "./model.js";
import { collectModelIssues } from "./modelIssues.js";

function model(): CapacityModel {
  return {
    schemaVersion: "1.0.0",
    modelId: "program-issues",
    name: "Program issues",
    planningGranularity: "month",
    horizonStart: "2027-01-01",
    horizonEnd: "2027-12-31",
    organization: [{ id: "site", name: "Site", type: "site" }],
    calendars: [],
    resourceGroups: [],
    resources: [],
    products: [{ id: "p1", name: "Part", organizationNodeId: "site" }],
    programs: [
      {
        id: "program-a",
        name: "Program A",
        productIds: ["p1"],
        anchorDate: "2026-11-01",
      },
    ],
    routingRevisions: [
      {
        id: "route",
        productId: "p1",
        revision: "A",
        effectiveFrom: "2026-01-01",
        phases: [
          {
            id: "phase",
            name: "Project",
            startWeeksBeforeShip: 0,
            endWeeksBeforeShip: 0,
            allocation: "spread",
          },
        ],
        operations: [
          {
            id: "op",
            sequence: 10,
            name: "Planning",
            phaseId: "phase",
            requirements: [
              {
                id: "req",
                resourceGroupId: "planning",
                basis: "perPeriod",
                requirement: { state: "value", value: 10, unit: "hours" },
              },
            ],
          },
        ],
      },
    ],
    scenarios: [
      {
        id: "baseline",
        name: "Baseline",
        kind: "baseline",
        createdAt: "2027-01-01T00:00:00.000Z",
      },
    ],
    demand: [],
  };
}

describe("program model issues", () => {
  it("warns when early and recurring project effort is clipped", () => {
    expect(collectModelIssues(model()).map((issue) => issue.code)).toEqual([
      "PROGRAM_ANCHOR_OUTSIDE_HORIZON",
      "PROGRAM_END_MISSING",
    ]);
  });

  it("reports missing and ambiguous program membership", () => {
    const candidate = model();
    candidate.programs = [];
    expect(collectModelIssues(candidate).map((issue) => issue.code)).toContain(
      "PROGRAM_MISSING",
    );

    candidate.programs = [
      {
        id: "a",
        name: "A",
        productIds: ["p1"],
        anchorDate: "2027-01-01",
      },
      {
        id: "b",
        name: "B",
        productIds: ["p1"],
        anchorDate: "2027-01-01",
      },
    ];
    expect(collectModelIssues(candidate).map((issue) => issue.code)).toContain(
      "PRODUCT_IN_MULTIPLE_PROGRAMS",
    );
  });
});
