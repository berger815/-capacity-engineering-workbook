import type { CalculationResult, ResourcePeriodResult } from "@capacity/domain";

export type DecisionState = "ready" | "watch" | "gap" | "incomplete";

export interface DecisionSummary {
  state: DecisionState;
  headline: string;
  explanation: string;
  governing: ResourcePeriodResult | null;
}

function utilizationScore(value: number | null): number {
  if (value === null) return -1;
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function rankConstraintPeriods(result: CalculationResult, limit = 8): ResourcePeriodResult[] {
  return [...result.results]
    .filter(row => row.load > 0)
    .sort((a, b) => utilizationScore(b.utilization) - utilizationScore(a.utilization))
    .slice(0, limit);
}

export function summarizeDecision(
  result: CalculationResult,
  resourceNames: Record<string, string> = {},
): DecisionSummary {
  const governing = result.governingConstraint;
  if (result.issues.some(issue => issue.severity === "error")) {
    return {
      state: "incomplete",
      headline: "The decision is not yet defensible",
      explanation: "At least one required routing or model input is missing. Resolve the blocking data issues before publishing a capacity commitment.",
      governing,
    };
  }

  if (!governing || governing.utilization === null) {
    return {
      state: "incomplete",
      headline: "No governing constraint can be established",
      explanation: "The selected scenario contains no comparable loaded capacity result.",
      governing,
    };
  }

  const name = resourceNames[governing.resourceGroupId] ?? governing.resourceGroupId;
  const period = `${governing.periodStart} to ${governing.periodEnd}`;
  if (!Number.isFinite(governing.utilization) || governing.utilization > 1) {
    return {
      state: "gap",
      headline: `${name} cannot support the current plan`,
      explanation: `The governing period is ${period}. Load exceeds available capacity by ${Math.abs(governing.gap).toFixed(1)} capacity units.`,
      governing,
    };
  }

  if (governing.utilization >= 0.85) {
    return {
      state: "watch",
      headline: `${name} is the controlling risk`,
      explanation: `The governing period is ${period}. The plan is inside modeled capacity, but the margin is too narrow to treat as a robust commitment.`,
      governing,
    };
  }

  return {
    state: "ready",
    headline: "The modeled plan is supportable",
    explanation: `${name} is the governing resource in ${period}, and the current scenario retains modeled capacity margin.`,
    governing,
  };
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  if (!Number.isFinite(value)) return "No capacity";
  return `${Math.round(value * 100)}%`;
}
