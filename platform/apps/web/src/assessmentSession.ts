import { capacityModelSchema, type CalculationResult, type CapacityModel, type ScenarioComparisonResult } from "@capacity/domain";

export type AssessmentOrigin = "new" | "opened" | "recovered" | "demo";

export interface AssessmentSession {
  sessionSchemaVersion: "1.0.0";
  savedAt: string;
  origin: Exclude<AssessmentOrigin, "demo">;
  activeStep: string;
  experience: "guided" | "expert";
  model: CapacityModel;
  calculation: CalculationResult | null;
  comparison: ScenarioComparisonResult | null;
}

export interface OpenedAssessment {
  model: CapacityModel;
  calculation: CalculationResult | null;
  comparison: ScenarioComparisonResult | null;
}

const DATABASE_NAME = "capacity-assurance-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "assessment-sessions";
const ACTIVE_KEY = "active";
const FALLBACK_KEY = "capacity-assurance-active-session";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local assessment storage"));
  });
}

function writeFallback(session: AssessmentSession): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(FALLBACK_KEY, JSON.stringify(session));
}

function readFallback(): AssessmentSession | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(FALLBACK_KEY);
  if (!raw) return null;
  try {
    return parseStoredSession(JSON.parse(raw));
  } catch {
    localStorage.removeItem(FALLBACK_KEY);
    return null;
  }
}

export async function saveAssessmentSession(session: AssessmentSession): Promise<void> {
  const snapshot = copy(session);
  writeFallback(snapshot);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(snapshot, ACTIVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save local assessment"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local assessment save was aborted"));
    });
    database.close();
  } catch {
    // The localStorage copy remains available as a compatibility fallback.
  }
}

export async function loadAssessmentSession(): Promise<AssessmentSession | null> {
  try {
    const database = await openDatabase();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(ACTIVE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to read local assessment"));
    });
    database.close();
    if (stored) return parseStoredSession(stored);
  } catch {
    // Fall through to the compatibility copy.
  }
  return readFallback();
}

export async function clearAssessmentSession(): Promise<void> {
  if (typeof localStorage !== "undefined") localStorage.removeItem(FALLBACK_KEY);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear local assessment"));
    });
    database.close();
  } catch {
    // There may be no IndexedDB implementation to clear.
  }
}

function validCalculation(value: unknown, model: CapacityModel): CalculationResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CalculationResult>;
  if (candidate.modelId !== model.modelId || typeof candidate.scenarioId !== "string" || !Array.isArray(candidate.results) || !Array.isArray(candidate.issues)) return null;
  return copy(candidate as CalculationResult);
}

function validComparison(value: unknown, model: CapacityModel): ScenarioComparisonResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ScenarioComparisonResult>;
  if (candidate.modelId !== model.modelId || typeof candidate.baselineScenarioId !== "string" || typeof candidate.comparisonScenarioId !== "string" || !Array.isArray(candidate.rows) || !Array.isArray(candidate.appliedActionIds)) return null;
  if (!validCalculation(candidate.baseline, model) || !validCalculation(candidate.comparison, model)) return null;
  return copy(candidate as ScenarioComparisonResult);
}

function parseStoredSession(value: unknown): AssessmentSession {
  if (!value || typeof value !== "object") throw new Error("Saved assessment is not an object");
  const candidate = value as Partial<AssessmentSession>;
  const model = capacityModelSchema.parse(candidate.model);
  return {
    sessionSchemaVersion: "1.0.0",
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : new Date().toISOString(),
    origin: candidate.origin === "opened" ? "opened" : candidate.origin === "recovered" ? "recovered" : "new",
    activeStep: typeof candidate.activeStep === "string" ? candidate.activeStep : "scope",
    experience: candidate.experience === "expert" ? "expert" : "guided",
    model,
    calculation: validCalculation(candidate.calculation, model),
    comparison: validComparison(candidate.comparison, model),
  };
}

export function parseAssessmentFile(content: string): OpenedAssessment {
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!payload || typeof payload !== "object") throw new Error("This file does not contain an assessment.");
  const object = payload as Record<string, unknown>;
  const snapshot = object.assessmentSnapshot && typeof object.assessmentSnapshot === "object"
    ? object.assessmentSnapshot as Record<string, unknown>
    : object.sessionSchemaVersion ? object : null;
  const rawModel = snapshot?.model ?? object.model ?? payload;
  const parsed = capacityModelSchema.safeParse(rawModel);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.map(String).join(" → ");
    throw new Error(`${path ? `${path}: ` : ""}${issue?.message ?? "The assessment model is invalid."}`);
  }
  const model = parsed.data;
  const comparison = validComparison(snapshot?.comparison ?? object.comparison, model);
  const calculation = validCalculation(snapshot?.calculation ?? object.calculation, model) ?? comparison?.baseline ?? null;
  return { model, calculation, comparison };
}

export function createNewAssessment(input: {
  name: string;
  horizonStart: string;
  horizonEnd: string;
  planningGranularity: "week" | "month";
}): CapacityModel {
  const stamp = Date.now().toString(36);
  const createdAt = new Date().toISOString();
  const siteId = `site-${stamp}`;
  const calendarId = `calendar-${stamp}`;
  const groupId = `work-area-${stamp}`;
  const productId = `product-${stamp}`;
  return {
    schemaVersion: "1.0.0",
    modelId: `assessment-${stamp}`,
    name: input.name.trim() || "Untitled Supplier Capacity Assessment",
    planningGranularity: input.planningGranularity,
    horizonStart: input.horizonStart,
    horizonEnd: input.horizonEnd,
    organization: [{ id: siteId, name: "Supplier site", type: "site" }],
    calendars: [{
      id: calendarId,
      name: "Standard workweek",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      weeklyMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 },
      exceptions: [],
    }],
    resourceGroups: [{
      id: groupId,
      name: "Primary work area",
      organizationNodeId: siteId,
      kind: "labor",
      capacityUnit: "hours",
      calendarId,
      pooled: true,
      tags: ["starter-record"],
    }],
    resources: [],
    products: [{
      id: productId,
      name: "First product",
      organizationNodeId: siteId,
      tags: ["starter-record"],
    }],
    routingRevisions: [],
    scenarios: [{ id: "baseline", name: "Baseline", kind: "baseline", createdAt }],
    demand: [],
    scenarioActions: [],
    actionLog: [],
    footprintPlans: [],
    planningWip: [],
    metadata: {
      assessmentMode: "local",
      createdAt,
      starterTemplate: true,
      category: "supplier capacity assessment",
    },
  };
}

export function serializeAssessmentSession(session: AssessmentSession): string {
  return JSON.stringify({
    fileType: "capacity-assessment",
    fileSchemaVersion: "1.0.0",
    savedAt: session.savedAt,
    assessmentSnapshot: {
      model: session.model,
      calculation: session.calculation,
      comparison: session.comparison,
    },
  }, null, 2);
}
