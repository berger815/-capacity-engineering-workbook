import { describe, expect, it } from "vitest";
import type { CapacityModel, ResourcePeriodResult } from "@capacity/domain";
import { aggregateResourceResults, buildFtePoints, riskBand } from "./exploration.js";

const rows: ResourcePeriodResult[] = [
  { scenarioId: "base", resourceGroupId: "labor", periodStart: "2027-01-01", periodEnd: "2027-01-31", load: 120, capacity: 100, gap: -20, utilization: 1.2 },
  { scenarioId: "base", resourceGroupId: "labor", periodStart: "2027-02-01", periodEnd: "2027-02-28", load: 80, capacity: 100, gap: 20, utilization: 0.8 },
  { scenarioId: "base", resourceGroupId: "labor", periodStart: "2027-04-01", periodEnd: "2027-04-30", load: 50, capacity: 100, gap: 50, utilization: 0.5 },
];

const model = {
  resources: [
    { id: "r1", resourceGroupId: "labor", name: "Team", quantity: 4, ratePerAvailableHour: 1, availability: 1, performance: 1, quality: 1 },
  ],
} as CapacityModel;

describe("analysis explorer helpers", () => {
  it("aggregates monthly results into calendar quarters", () => {
    const points = aggregateResourceResults(rows, "labor", "quarter");
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ key: "2027-Q1", load: 200, capacity: 200, gap: 0, utilization: 1 });
    expect(points[1]).toMatchObject({ key: "2027-Q2", load: 50, capacity: 100, gap: 50, utilization: 0.5 });
  });

  it("converts labor utilization to effective FTE equivalents", () => {
    const points = aggregateResourceResults(rows, "labor", "native");
    const fte = buildFtePoints(model, "labor", points);
    expect(fte[0]?.availableFte).toBe(4);
    expect(fte[0]?.requiredFte).toBeCloseTo(4.8);
    expect(fte[0]?.fteGap).toBeCloseTo(-0.8);
  });

  it("assigns capacity risk bands consistently", () => {
    expect(riskBand(null)).toBe("none");
    expect(riskBand(0.7)).toBe("green");
    expect(riskBand(0.9)).toBe("amber");
    expect(riskBand(1.01)).toBe("red");
    expect(riskBand(Number.POSITIVE_INFINITY)).toBe("blocked");
  });
});
