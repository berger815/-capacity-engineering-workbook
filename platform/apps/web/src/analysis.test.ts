import { describe, expect, it } from "vitest";
import type { CalculationResult, ResourcePeriodResult } from "@capacity/domain";
import { formatPercent, rankConstraintPeriods, summarizeDecision } from "./analysis.js";

function row(utilization: number | null, gap: number, id = "rg-1"): ResourcePeriodResult {
  return {
    scenarioId: "baseline",
    resourceGroupId: id,
    periodStart: "2027-01-01",
    periodEnd: "2027-01-31",
    load: 100,
    capacity: 100 + gap,
    gap,
    utilization,
  };
}

function result(rows: ResourcePeriodResult[]): CalculationResult {
  return {
    modelId: "test-model",
    scenarioId: "baseline",
    generatedAt: "2026-07-18T00:00:00.000Z",
    results: rows,
    governingConstraint: rows[0] ?? null,
    issues: [],
  };
}

describe("assessment decision helpers", () => {
  it("identifies a capacity gap and names the governing resource", () => {
    const summary = summarizeDecision(result([row(1.25, -20)]), { "rg-1": "Heat Treatment Oven" });
    expect(summary.state).toBe("gap");
    expect(summary.headline).toContain("Heat Treatment Oven");
    expect(summary.explanation).toContain("20.0");
  });

  it("treats a narrow margin as a watch condition", () => {
    expect(summarizeDecision(result([row(0.91, 9)])).state).toBe("watch");
  });

  it("ranks the highest utilization periods first", () => {
    const ranked = rankConstraintPeriods(result([row(0.7, 30, "low"), row(1.1, -10, "high")]), 2);
    expect(ranked.map(item => item.resourceGroupId)).toEqual(["high", "low"]);
  });

  it("formats no-capacity and missing utilization explicitly", () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("No capacity");
    expect(formatPercent(null)).toBe("—");
  });
});