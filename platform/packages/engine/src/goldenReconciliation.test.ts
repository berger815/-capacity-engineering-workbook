import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { northstarRecoveryModel } from "@capacity/fixtures";
import { calculateCapacity, compareCapacityScenarios } from "./index.js";

function digest(value: unknown): string {
  const normalized = structuredClone(value) as Record<string, unknown>;
  delete normalized.generatedAt;
  if (normalized.baseline && typeof normalized.baseline === "object") delete (normalized.baseline as Record<string, unknown>).generatedAt;
  if (normalized.comparison && typeof normalized.comparison === "object") delete (normalized.comparison as Record<string, unknown>).generatedAt;
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

describe("Northstar golden reconciliation", () => {
  it("preserves byte-identical legacy baseline results when programs and bases are absent", () => {
    expect(northstarRecoveryModel.programs).toBeUndefined();
    expect(digest(calculateCapacity(northstarRecoveryModel, "baseline"))).toBe("500bb08a34bec72619efe7777b950888cd70e9e8b99136c541f1cb48b8b948dc");
  });

  it("preserves the recovery and comparison result surfaces", () => {
    expect(digest(calculateCapacity(northstarRecoveryModel, "recovery-1"))).toBe("4f1d8a00e23f69c4a791e07e5459aafc56d95be62b0b6dcc2da01caf3cfee25b");
    expect(digest(compareCapacityScenarios(northstarRecoveryModel, "baseline", "recovery-1"))).toBe("83b3831bd65565478a9b7e1a913984513b502af7bdb8570f53a1731eda922251");
  });
});
