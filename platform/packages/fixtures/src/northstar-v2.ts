import type {
  CapacityModel,
  LeadTimePhase,
  RoutingOperation,
  RoutingRequirement,
} from "@capacity/domain";

const source = "Northstar synthetic demonstration v2";

function hours(id: string, resourceGroupId: string, value: number): RoutingRequirement {
  return {
    id,
    resourceGroupId,
    requirement: {
      state: "value",
      value,
      unit: "hours",
      source,
      confidence: "high",
    },
  };
}

function operation(
  id: string,
  sequence: number,
  name: string,
  phaseId: string,
  requirements: RoutingRequirement[],
): RoutingOperation {
  return { id, sequence, name, phaseId, requirements };
}

const hx100Phases: LeadTimePhase[] = [
  { id: "hx100-configure", name: "Applications / Configure", startWeeksBeforeShip: 20, endWeeksBeforeShip: 17, allocation: "spread" },
  { id: "hx100-detail", name: "Detailed Engineering", startWeeksBeforeShip: 17, endWeeksBeforeShip: 12, allocation: "spread" },
  { id: "hx100-plate", name: "Plate Preparation", startWeeksBeforeShip: 12, endWeeksBeforeShip: 9, allocation: "spread" },
  { id: "hx100-weld", name: "Welding", startWeeksBeforeShip: 9, endWeeksBeforeShip: 5, allocation: "spread" },
  { id: "hx100-assembly", name: "Assembly", startWeeksBeforeShip: 4, endWeeksBeforeShip: 2, allocation: "spread" },
  { id: "hx100-test", name: "Final Test & Ship Prep", startWeeksBeforeShip: 2, endWeeksBeforeShip: 0, allocation: "spread" },
];

const hx200Phases: LeadTimePhase[] = [
  { id: "hx200-configure", name: "Applications / Configure", startWeeksBeforeShip: 36, endWeeksBeforeShip: 32, allocation: "spread" },
  { id: "hx200-detail", name: "Detailed Engineering", startWeeksBeforeShip: 32, endWeeksBeforeShip: 22, allocation: "spread" },
  { id: "hx200-plate", name: "Plate Preparation", startWeeksBeforeShip: 22, endWeeksBeforeShip: 17, allocation: "spread" },
  { id: "hx200-weld", name: "Welding", startWeeksBeforeShip: 17, endWeeksBeforeShip: 10, allocation: "spread" },
  { id: "hx200-heat", name: "Heat Treatment", startWeeksBeforeShip: 10, endWeeksBeforeShip: 7, allocation: "spread" },
  { id: "hx200-assembly", name: "Assembly", startWeeksBeforeShip: 7, endWeeksBeforeShip: 3, allocation: "spread" },
  { id: "hx200-test", name: "Final Test", startWeeksBeforeShip: 3, endWeeksBeforeShip: 1, allocation: "spread" },
  { id: "hx200-ship", name: "Ship Prep", startWeeksBeforeShip: 1, endWeeksBeforeShip: 0, allocation: "spread" },
];

const hx300Phases: LeadTimePhase[] = [
  { id: "hx300-configure", name: "Configuration", startWeeksBeforeShip: 14, endWeeksBeforeShip: 12, allocation: "spread" },
  { id: "hx300-detail", name: "Detail Release", startWeeksBeforeShip: 12, endWeeksBeforeShip: 8, allocation: "spread" },
  { id: "hx300-purchased", name: "Purchased Module Lead — Fabrication Bypass", startWeeksBeforeShip: 8, endWeeksBeforeShip: 6, allocation: "spread" },
  { id: "hx300-integration", name: "Integration Assembly", startWeeksBeforeShip: 6, endWeeksBeforeShip: 2, allocation: "spread" },
  { id: "hx300-test", name: "Final Test & Ship Prep", startWeeksBeforeShip: 2, endWeeksBeforeShip: 0, allocation: "spread" },
];

const servicePhases: LeadTimePhase[] = [
  { id: "serv-scope", name: "Scope & Quote", startWeeksBeforeShip: 8, endWeeksBeforeShip: 6, allocation: "spread" },
  { id: "serv-engineering", name: "Retrofit Engineering", startWeeksBeforeShip: 6, endWeeksBeforeShip: 4, allocation: "spread" },
  { id: "serv-kit", name: "Parts Kitting — Fabrication Bypass", startWeeksBeforeShip: 4, endWeeksBeforeShip: 2, allocation: "spread" },
  { id: "serv-assembly", name: "Shop Assembly", startWeeksBeforeShip: 2, endWeeksBeforeShip: 1, allocation: "spread" },
  { id: "serv-test", name: "Final Verification & Ship", startWeeksBeforeShip: 1, endWeeksBeforeShip: 0, allocation: "spread" },
];

const demandByProduct: Record<string, number[]> = {
  hx100: [50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 120, 150],
  hx200: [15, 15, 20, 20, 25, 30, 35, 40, 45, 50, 50, 55],
  hx300: [0, 0, 10, 15, 20, 25, 30, 35, 40, 50, 60, 65],
  service: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
};

const demand = Object.entries(demandByProduct).flatMap(([productId, values]) =>
  values.map((quantity, monthIndex) => ({
    id: `baseline-${productId}-2027-${String(monthIndex + 1).padStart(2, "0")}`,
    scenarioId: "baseline",
    productId,
    shipDate: `2027-${String(monthIndex + 1).padStart(2, "0")}-15`,
    quantity,
    demandClass: "forecast" as const,
    customerOrProgram: "Harbor Works launch",
    sourceSystem: "synthetic-v2",
  })),
);

export const northstarV2Model: CapacityModel = {
  schemaVersion: "1.0.0",
  modelId: "northstar-v2",
  name: "Northstar Thermal Systems — Harbor Works",
  planningGranularity: "month",
  horizonStart: "2026-01-01",
  horizonEnd: "2027-12-31",
  organization: [
    { id: "northstar", name: "Northstar Thermal Systems", type: "enterprise" },
    { id: "harbor-works", name: "Harbor Works", type: "site", parentId: "northstar" },
    { id: "engineering", name: "Engineering", type: "area", parentId: "harbor-works" },
    { id: "fabrication", name: "Fabrication", type: "area", parentId: "harbor-works" },
    { id: "integration", name: "Integration & Verification", type: "area", parentId: "harbor-works" },
  ],
  calendars: [
    {
      id: "harbor-standard",
      name: "Harbor Works standard calendar",
      timezone: "America/New_York",
      weeklyMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 },
      exceptions: [
        { date: "2026-07-03", availableMinutes: 0, reason: "Independence Day shutdown" },
        { date: "2026-11-26", availableMinutes: 0, reason: "Thanksgiving shutdown" },
        { date: "2026-12-24", availableMinutes: 0, reason: "Winter shutdown" },
        { date: "2026-12-25", availableMinutes: 0, reason: "Winter shutdown" },
        { date: "2027-07-05", availableMinutes: 0, reason: "Independence Day shutdown" },
        { date: "2027-11-25", availableMinutes: 0, reason: "Thanksgiving shutdown" },
        { date: "2027-12-24", availableMinutes: 0, reason: "Winter shutdown" },
      ],
    },
  ],
  resourceGroups: [
    { id: "rg-app", name: "Applications Engineering", organizationNodeId: "engineering", kind: "labor", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-detail", name: "Detailed Engineering", organizationNodeId: "engineering", kind: "labor", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-plate", name: "Plate Preparation", organizationNodeId: "fabrication", kind: "labor", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-weld", name: "Qualified Welding Labor", organizationNodeId: "fabrication", kind: "skill", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-heat", name: "Heat Treatment Labor", organizationNodeId: "fabrication", kind: "labor", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-assembly", name: "Assembly Labor", organizationNodeId: "integration", kind: "labor", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-test", name: "Final Test Labor", organizationNodeId: "integration", kind: "skill", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-warehouse", name: "Warehouse Labor", organizationNodeId: "integration", kind: "labor", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-positioner", name: "Welding Positioners", organizationNodeId: "fabrication", kind: "equipment", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-oven", name: "Heat Treatment Oven", organizationNodeId: "fabrication", kind: "equipment", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-mod-fixture", name: "Modular Integration Fixtures", organizationNodeId: "integration", kind: "tooling", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
    { id: "rg-test-stand", name: "Final Test Stands", organizationNodeId: "integration", kind: "equipment", capacityUnit: "hours", calendarId: "harbor-standard", pooled: true },
  ],
  resources: [
    { id: "res-app", resourceGroupId: "rg-app", name: "Applications FTE pool", quantity: 6, ratePerAvailableHour: 1, availability: 0.88, performance: 0.98, quality: 1 },
    { id: "res-detail", resourceGroupId: "rg-detail", name: "Detailed engineering FTE pool", quantity: 10, ratePerAvailableHour: 1, availability: 0.88, performance: 0.98, quality: 1 },
    { id: "res-plate", resourceGroupId: "rg-plate", name: "Plate preparation FTE pool", quantity: 12, ratePerAvailableHour: 1, availability: 0.86, performance: 0.97, quality: 0.99 },
    { id: "res-weld", resourceGroupId: "rg-weld", name: "Qualified welder pool", quantity: 20, ratePerAvailableHour: 1, availability: 0.86, performance: 0.97, quality: 0.99 },
    { id: "res-heat", resourceGroupId: "rg-heat", name: "Heat treatment FTE pool", quantity: 8, ratePerAvailableHour: 1, availability: 0.88, performance: 0.98, quality: 0.99 },
    { id: "res-assembly", resourceGroupId: "rg-assembly", name: "Assembly FTE pool", quantity: 19, ratePerAvailableHour: 1, availability: 0.86, performance: 0.97, quality: 0.99 },
    { id: "res-test", resourceGroupId: "rg-test", name: "Test technician pool", quantity: 14, ratePerAvailableHour: 1, availability: 0.88, performance: 0.98, quality: 0.995 },
    { id: "res-warehouse", resourceGroupId: "rg-warehouse", name: "Warehouse FTE pool", quantity: 8, ratePerAvailableHour: 1, availability: 0.9, performance: 0.98, quality: 1 },
    { id: "res-positioner", resourceGroupId: "rg-positioner", name: "Installed positioners", quantity: 7, ratePerAvailableHour: 1, availability: 0.84, performance: 0.9, quality: 0.99 },
    { id: "res-oven", resourceGroupId: "rg-oven", name: "Batch heat-treatment oven", quantity: 2, ratePerAvailableHour: 1, availability: 0.8, performance: 0.9, quality: 0.99 },
    { id: "res-mod-fixture", resourceGroupId: "rg-mod-fixture", name: "Modular integration fixtures", quantity: 3, ratePerAvailableHour: 1, availability: 0.9, performance: 0.95, quality: 1 },
    { id: "res-test-stand", resourceGroupId: "rg-test-stand", name: "Final test stands", quantity: 4, ratePerAvailableHour: 1, availability: 0.85, performance: 0.92, quality: 0.995 },
  ],
  products: [
    { id: "hx100", name: "HX-100 Standard", family: "Industrial Heat Exchangers", organizationNodeId: "harbor-works", tags: ["medium-risk"] },
    { id: "hx200", name: "HX-200 High Pressure", family: "Industrial Heat Exchangers", organizationNodeId: "harbor-works", tags: ["high-risk", "heat-treatment"] },
    { id: "hx300", name: "HX-300 Modular", family: "Industrial Heat Exchangers", organizationNodeId: "harbor-works", tags: ["critical-risk", "fabrication-bypass"] },
    { id: "service", name: "Service & Retrofit", family: "Aftermarket", organizationNodeId: "harbor-works", tags: ["fabrication-bypass"] },
  ],
  routingRevisions: [
    {
      id: "route-hx100-a",
      productId: "hx100",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: hx100Phases,
      operations: [
        operation("hx100-app", 10, "Applications engineering", "hx100-configure", [hours("hx100-app-labor", "rg-app", 0.975)]),
        operation("hx100-detail", 20, "Detailed engineering", "hx100-detail", [hours("hx100-detail-labor", "rg-detail", 1.75)]),
        operation("hx100-plate", 30, "Plate preparation", "hx100-plate", [hours("hx100-plate-labor", "rg-plate", 3)]),
        operation("hx100-weld", 40, "Welding", "hx100-weld", [hours("hx100-weld-labor", "rg-weld", 15), hours("hx100-positioner", "rg-positioner", 10)]),
        operation("hx100-assembly", 50, "Assembly", "hx100-assembly", [hours("hx100-assembly-labor", "rg-assembly", 7)]),
        operation("hx100-test", 60, "Final test", "hx100-test", [hours("hx100-test-labor", "rg-test", 4), hours("hx100-test-stand", "rg-test-stand", 1.5)]),
        operation("hx100-warehouse", 70, "Ship preparation", "hx100-test", [hours("hx100-warehouse-labor", "rg-warehouse", 0.5)]),
      ],
      sourceSystem: "synthetic-v2",
    },
    {
      id: "route-hx200-a",
      productId: "hx200",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: hx200Phases,
      operations: [
        operation("hx200-app", 10, "Applications engineering", "hx200-configure", [hours("hx200-app-labor", "rg-app", 4)]),
        operation("hx200-detail", 20, "Detailed engineering", "hx200-detail", [hours("hx200-detail-labor", "rg-detail", 14)]),
        operation("hx200-plate", 30, "Plate preparation", "hx200-plate", [hours("hx200-plate-labor", "rg-plate", 6)]),
        operation("hx200-weld", 40, "High-pressure welding", "hx200-weld", [hours("hx200-weld-labor", "rg-weld", 24), hours("hx200-positioner", "rg-positioner", 18)]),
        operation("hx200-heat", 50, "Heat treatment", "hx200-heat", [hours("hx200-heat-labor", "rg-heat", 8), hours("hx200-oven", "rg-oven", 6)]),
        operation("hx200-assembly", 60, "Assembly", "hx200-assembly", [hours("hx200-assembly-labor", "rg-assembly", 12)]),
        operation("hx200-test", 70, "Final test", "hx200-test", [hours("hx200-test-labor", "rg-test", 8), hours("hx200-test-stand", "rg-test-stand", 3)]),
        operation("hx200-warehouse", 80, "Ship preparation", "hx200-ship", [hours("hx200-warehouse-labor", "rg-warehouse", 1)]),
      ],
      sourceSystem: "synthetic-v2",
    },
    {
      id: "route-hx300-a",
      productId: "hx300",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: hx300Phases,
      operations: [
        operation("hx300-app", 10, "Configuration", "hx300-configure", [hours("hx300-app-labor", "rg-app", 0.375)]),
        operation("hx300-detail", 20, "Detail release", "hx300-detail", [hours("hx300-detail-labor", "rg-detail", 0.75)]),
        operation("hx300-module", 30, "Purchased module coordination", "hx300-purchased", [hours("hx300-warehouse-labor", "rg-warehouse", 0.4)]),
        operation("hx300-integration", 40, "Integration assembly", "hx300-integration", [hours("hx300-assembly-labor", "rg-assembly", 14), hours("hx300-fixture", "rg-mod-fixture", 6)]),
        operation("hx300-test", 50, "Final test", "hx300-test", [hours("hx300-test-labor", "rg-test", 10), hours("hx300-test-stand", "rg-test-stand", 2.5)]),
        operation("hx300-warehouse", 60, "Ship preparation", "hx300-test", [hours("hx300-warehouse-ship", "rg-warehouse", 0.4)]),
      ],
      sourceSystem: "synthetic-v2",
    },
    {
      id: "route-service-a",
      productId: "service",
      revision: "A",
      effectiveFrom: "2026-01-01",
      phases: servicePhases,
      operations: [
        operation("serv-app", 10, "Scope and quote", "serv-scope", [hours("serv-app-labor", "rg-app", 0.8)]),
        operation("serv-detail", 20, "Retrofit engineering", "serv-engineering", [hours("serv-detail-labor", "rg-detail", 1.2)]),
        operation("serv-kit", 30, "Parts kitting", "serv-kit", [hours("serv-warehouse-kit", "rg-warehouse", 0.3)]),
        operation("serv-assembly", 40, "Shop assembly", "serv-assembly", [hours("serv-assembly-labor", "rg-assembly", 3)]),
        operation("serv-test", 50, "Final verification", "serv-test", [hours("serv-test-labor", "rg-test", 2), hours("serv-test-stand", "rg-test-stand", 0.5)]),
      ],
      sourceSystem: "synthetic-v2",
    },
  ],
  scenarios: [
    {
      id: "baseline",
      name: "2027 launch baseline",
      kind: "baseline",
      createdAt: "2026-07-18T00:00:00.000Z",
      createdBy: "synthetic-fixture",
      assumptions: {
        "zero-routing-values": "translated as absent sparse operations",
        "demand-basis": "monthly 2027 synthetic forecast",
      },
    },
  ],
  demand,
  metadata: {
    synthetic: true,
    sourceVersion: "Capacity Workbook v6.86 / Northstar v2",
    purpose: "Golden regression and demonstration fixture",
  },
};
