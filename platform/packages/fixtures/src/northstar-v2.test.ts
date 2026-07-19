import { describe, expect, it } from "vitest";
import { capacityModelSchema } from "@capacity/domain";
import { northstarV2Model } from "./northstar-v2.js";

function routedGroups(productId: string): Set<string> {
  const revision = northstarV2Model.routingRevisions.find(item => item.productId === productId);
  if (!revision) throw new Error(`Missing route for ${productId}`);
  return new Set(revision.operations.flatMap(operation => operation.requirements.map(item => item.resourceGroupId)));
}

describe("Northstar v2 canonical fixture", () => {
  it("passes runtime schema validation", () => {
    expect(capacityModelSchema.safeParse(northstarV2Model).success).toBe(true);
  });

  it("preserves four product-specific lead-time envelopes", () => {
    const maximumLeadTime = Object.fromEntries(
      northstarV2Model.routingRevisions.map(revision => [
        revision.productId,
        Math.max(...revision.phases.map(phase => phase.startWeeksBeforeShip)),
      ]),
    );

    expect(maximumLeadTime).toEqual({ hx100: 20, hx200: 36, hx300: 14, service: 8 });
  });

  it("stores bypasses sparsely rather than as ambiguous zero-hour requirements", () => {
    expect(routedGroups("hx300").has("rg-weld")).toBe(false);
    expect(routedGroups("hx300").has("rg-heat")).toBe(false);
    expect(routedGroups("hx300").has("rg-positioner")).toBe(false);
    expect(routedGroups("service").has("rg-plate")).toBe(false);
    expect(routedGroups("service").has("rg-weld")).toBe(false);
    expect(routedGroups("hx200").has("rg-weld")).toBe(true);
    expect(routedGroups("hx200").has("rg-oven")).toBe(true);
  });

  it("contains the complete monthly 2027 launch demand series", () => {
    expect(northstarV2Model.demand).toHaveLength(48);
    expect(northstarV2Model.demand.reduce((sum, row) => sum + row.quantity, 0)).toBe(1990);
    expect(northstarV2Model.demand.every(row => row.shipDate.startsWith("2027-"))).toBe(true);
  });
});
