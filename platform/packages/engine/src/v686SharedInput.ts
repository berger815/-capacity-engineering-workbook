export const v686SharedInput = {
  referenceSourceSha256: "1dde381ae54947126c572b0d1af3553eba70e6856c31dec73b64630330684ea1",
  year: 2027,
  demandUnits: 100,
  availability: 0.9,
  performance: 0.95,
  quality: 0.98,
  grossHoursPerResource: 2088,
  labor: {
    standardHoursPerUnit: 12,
    rework: 0.05,
    resourceCount: 1,
  },
  equipment: {
    routingHoursPerUnit: 2,
    rework: 0.05,
    resourceCount: 2,
  },
} as const;

export type V686SharedInput = typeof v686SharedInput;

/** Captured by executing the pinned v6.86 functions against v686SharedInput. */
export const capturedV686Output = {
  oee: 0.8379,
  laborCapacity: 1749.5352,
  laborLoad: 1260,
  equipmentCapacity: 3499.0704,
  equipmentLoad: 210,
} as const;
