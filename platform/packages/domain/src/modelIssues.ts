import type { CapacityModel, ModelIssue } from "./model.js";

/** Semantic model checks shared by readiness and calculation. */
export function collectModelIssues(model: CapacityModel): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const membership = new Map<string, string>();

  for (const program of model.programs ?? []) {
    for (const productId of program.productIds) {
      const prior = membership.get(productId);
      if (prior) {
        issues.push({
          severity: "error",
          code: "PRODUCT_IN_MULTIPLE_PROGRAMS",
          message: `Product ${productId} belongs to programs ${prior} and ${program.id}`,
          entityType: "product",
          entityId: productId,
        });
      } else {
        membership.set(productId, program.id);
      }
    }
  }

  const programRequirementProducts = new Set<string>();
  const perPeriodProducts = new Set<string>();
  for (const revision of model.routingRevisions) {
    for (const operation of revision.operations) {
      for (const requirement of operation.requirements) {
        const basis = requirement.basis ?? "perUnit";
        if (basis !== "perUnit") programRequirementProducts.add(revision.productId);
        if (basis === "perPeriod") perPeriodProducts.add(revision.productId);
      }
    }
  }

  for (const productId of programRequirementProducts) {
    if (!membership.has(productId)) {
      issues.push({
        severity: "error",
        code: "PROGRAM_MISSING",
        message: `Product ${productId} has a non-per-unit requirement but is not assigned to a program`,
        entityType: "product",
        entityId: productId,
      });
    }
  }

  for (const program of model.programs ?? []) {
    if (!program.productIds.some(productId => programRequirementProducts.has(productId))) continue;
    if (program.anchorDate < model.horizonStart) {
      issues.push({
        severity: "warning",
        code: "PROGRAM_ANCHOR_OUTSIDE_HORIZON",
        message: `Program ${program.name} starts before the assessment horizon; some effort may fall outside the assessed window`,
        entityType: "program",
        entityId: program.id,
      });
    }
    if (!program.endDate && program.productIds.some(productId => perPeriodProducts.has(productId))) {
      issues.push({
        severity: "warning",
        code: "PROGRAM_END_MISSING",
        message: `Program ${program.name} has recurring requirements without an end date; load is clipped to the horizon end`,
        entityType: "program",
        entityId: program.id,
      });
    }
  }

  return issues;
}
