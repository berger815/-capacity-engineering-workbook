import { useEffect, useMemo, useState } from "react";
import type {
  CalculationResult,
  CapacityModel,
  ScenarioComparisonResult,
} from "@capacity/domain";
import {
  calculateModel,
  loadNorthstar,
  validateModel,
  type ModelValidationResult,
} from "./api.js";
import {
  formatPercent,
  rankConstraintPeriods,
  summarizeDecision,
} from "./analysis.js";
import AnalysisExplorer from "./AnalysisExplorer.js";
import ConstraintExplorer from "./ConstraintExplorer.js";
import DecisionExports from "./DecisionExports.js";
import LaunchPad from "./LaunchPad.js";
import ModelWorkbench from "./ModelWorkbench.js";
import RecoveryPanel from "./RecoveryPanel.js";
import { findBaselineScenarioId } from "./recovery.js";
import { calculationInputsChanged, weeklyScaleWarning } from "./calculationInputs.js";
import {
  clearAssessmentSession,
  createFollowUpAssessment,
  createNewAssessment,
  listStoredAssessments,
  loadAssessmentSession,
  parseAssessmentFile,
  saveAssessmentToLibrary,
  saveAssessmentSession,
  serializeAssessmentSession,
  type AssessmentOrigin,
  type AssessmentSession,
  type StoredAssessment,
} from "./assessmentSession.js";
import type { WorkbenchTarget } from "./workbench/entityDefinitions.js";
import "./ui-extensions.css";

const steps = [
  { id: "scope", label: "Scope", help: "Define the decision and boundaries" },
  { id: "data", label: "Model", help: "Build and reconcile supplier inputs" },
  {
    id: "readiness",
    label: "Readiness",
    help: "Resolve decision-blocking gaps",
  },
  { id: "analysis", label: "Calculate", help: "Place load against capacity" },
  {
    id: "capacity",
    label: "Capacity Analysis",
    help: "Explore charts, gaps, and detail",
  },
  { id: "footprint", label: "Footprint", help: "Test WIP, space, and storage" },
  { id: "recovery", label: "Recovery", help: "Test governed countermeasures" },
  {
    id: "actions",
    label: "Action Log",
    help: "Track gaps, risks, and decisions",
  },
  { id: "decision", label: "Decision", help: "Commit with evidence" },
] as const;

export type StepId = (typeof steps)[number]["id"];
type BusyState = "loading" | "validating" | "calculating" | null;
type ExperienceMode = "guided" | "expert";

function isStepId(value: string): value is StepId {
  return steps.some((step) => step.id === value);
}

function resourceNameMap(model: CapacityModel | null): Record<string, string> {
  return Object.fromEntries(
    model?.resourceGroups.map((group) => [group.id, group.name]) ?? [],
  );
}

function StepNav({
  active,
  onSelect,
}: {
  active: StepId;
  onSelect: (step: StepId) => void;
}) {
  return (
    <nav className="step-nav" aria-label="Assessment workflow">
      {steps.map((step, index) => (
        <button
          key={step.id}
          className={`step-button ${active === step.id ? "active" : ""} ${["data", "footprint", "actions"].includes(step.id) ? "model-step" : ""}`}
          onClick={() => onSelect(step.id)}
          type="button"
        >
          <span className="step-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>
            <strong>{step.label}</strong>
            <small>{step.help}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function StatusBanner({
  validation,
  calculation,
  stale,
}: {
  validation: ModelValidationResult | null;
  calculation: CalculationResult | null;
  stale: boolean;
}) {
  if (stale)
    return (
      <div className="status-banner neutral">
        <strong>Results are out of date.</strong> Model inputs changed; run the
        calculation again before using the finding.
      </div>
    );
  if (!validation)
    return (
      <div className="status-banner neutral">
        Model readiness has not been checked.
      </div>
    );
  if (!validation.valid)
    return (
      <div className="status-banner bad">
        The model has blocking validation issues.
      </div>
    );
  if (!calculation)
    return (
      <div className="status-banner good">
        The model is structurally ready. Run the analysis to establish the
        decision.
      </div>
    );
  const blocking = calculation.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  return blocking > 0 ? (
    <div className="status-banner bad">
      Calculation completed with {blocking} blocking issue
      {blocking === 1 ? "" : "s"}.
    </div>
  ) : (
    <div className="status-banner good">
      Baseline calculation completed. Capacity Analysis is ready for
      exploration.
    </div>
  );
}

function saveFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "capacity-assessment"
  );
}

export default function FieldApp() {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [recovered, setRecovered] = useState<AssessmentSession | null>(null);
  const [library, setLibrary] = useState<StoredAssessment[]>([]);
  const [origin, setOrigin] = useState<AssessmentOrigin>("new");
  const [activeStep, setActiveStep] = useState<StepId>("scope");
  const [model, setModel] = useState<CapacityModel | null>(null);
  const [validation, setValidation] = useState<ModelValidationResult | null>(
    null,
  );
  const [calculation, setCalculation] = useState<CalculationResult | null>(
    null,
  );
  const [comparison, setComparison] = useState<ScenarioComparisonResult | null>(
    null,
  );
  const [busy, setBusy] = useState<BusyState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceMode>(() =>
    typeof window === "undefined"
      ? "guided"
      : window.localStorage.getItem("capacity-experience-mode") === "expert"
        ? "expert"
        : "guided",
  );
  const [workbenchTarget, setWorkbenchTarget] =
    useState<WorkbenchTarget | null>(null);
  const [autosaveAt, setAutosaveAt] = useState<string | null>(null);
  const [librarySavedAt, setLibrarySavedAt] = useState<string | null>(null);
  const [resultsStale, setResultsStale] = useState(false);

  const names = useMemo(() => resourceNameMap(model), [model]);
  const baselineScenarioId = model ? findBaselineScenarioId(model) : "baseline";
  const decisionCalculation = comparison?.comparison ?? calculation;
  const baselineDecision = comparison
    ? summarizeDecision(comparison.baseline, names)
    : calculation
      ? summarizeDecision(calculation, names)
      : null;
  const decision = decisionCalculation
    ? summarizeDecision(decisionCalculation, names)
    : null;
  const constraints = decisionCalculation
    ? rankConstraintPeriods(decisionCalculation, 10)
    : [];
  const supplierHistory = model?.supplier
    ? library
        .filter(
          (assessment) =>
            assessment.supplierId === model.supplier?.supplierId,
        )
        .map((assessment) => ({
          assessmentId: assessment.assessmentId,
          assessmentDate: assessment.assessmentDate,
          decisionState: assessment.decisionState ?? "incomplete",
        }))
        .sort((a, b) => a.assessmentDate.localeCompare(b.assessmentDate))
    : [];

  useEffect(() => {
    void Promise.all([loadAssessmentSession(), listStoredAssessments()])
      .then(([session, assessments]) => {
        setRecovered(session);
        setLibrary(assessments);
      })
      .finally(() => setBusy(null));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem("capacity-experience-mode", experience);
  }, [experience]);

  useEffect(() => {
    if (!workspaceOpen || !model || origin === "demo") return;
    const handle = window.setTimeout(() => {
      const session: AssessmentSession = {
        sessionSchemaVersion: "1.0.0",
        savedAt: new Date().toISOString(),
        origin:
          origin === "opened"
            ? "opened"
            : origin === "recovered"
              ? "recovered"
              : "new",
        activeStep,
        experience,
        model,
        calculation,
        comparison,
      };
      void saveAssessmentSession(session).then(() => {
        setRecovered(session);
        setAutosaveAt(session.savedAt);
      });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [
    workspaceOpen,
    model,
    calculation,
    comparison,
    activeStep,
    experience,
    origin,
  ]);

  async function checkModel(
    candidate: CapacityModel,
  ): Promise<ModelValidationResult> {
    setBusy("validating");
    try {
      const result = await validateModel(candidate);
      setValidation(result);
      return result;
    } finally {
      setBusy(null);
    }
  }

  async function enterAssessment(next: {
    model: CapacityModel;
    calculation?: CalculationResult | null;
    comparison?: ScenarioComparisonResult | null;
    origin: AssessmentOrigin;
    step?: StepId;
    experience?: ExperienceMode;
  }): Promise<void> {
    setError(null);
    const result = await validateModel(next.model);
    setModel(next.model);
    setCalculation(next.calculation ?? null);
    setComparison(next.comparison ?? null);
    setValidation(result);
    setOrigin(next.origin);
    setActiveStep(next.step ?? "scope");
    if (next.experience) setExperience(next.experience);
    setResultsStale(false);
    setWorkbenchTarget(null);
    setWorkspaceOpen(true);
    setBusy(null);
  }

  async function loadDemo(): Promise<void> {
    try {
      setBusy("loading");
      const fixture = await loadNorthstar();
      await enterAssessment({
        model: {
          ...fixture,
          metadata: {
            ...(fixture.metadata ?? {}),
            assessmentMode: "demo",
            syntheticData: true,
          },
        },
        origin: "demo",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the demonstration assessment",
      );
      setBusy(null);
    }
  }

  async function startNew(
    input: Parameters<typeof createNewAssessment>[0] & {
      priorAssessmentId?: string;
      carryActions: boolean;
      reuseModel: boolean;
    },
  ): Promise<void> {
    try {
      setBusy("loading");
      const { priorAssessmentId, carryActions, reuseModel, ...assessmentInput } =
        input;
      const prior = library.find(
        (assessment) => assessment.assessmentId === priorAssessmentId,
      );
      await enterAssessment({
        model: prior
          ? createFollowUpAssessment(assessmentInput, prior, {
              carryActions,
              reuseModel,
            })
          : createNewAssessment(assessmentInput),
        origin: "new",
        step: "data",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the assessment",
      );
      setBusy(null);
    }
  }

  async function openFile(file: File): Promise<void> {
    try {
      setBusy("loading");
      setError(null);
      const opened = parseAssessmentFile(await file.text());
      await enterAssessment({
        ...opened,
        origin: "opened",
        step: opened.calculation ? "capacity" : "scope",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to open the assessment file",
      );
      setBusy(null);
    }
  }

  async function resumeAssessment(): Promise<void> {
    if (!recovered) return;
    await enterAssessment({
      model: recovered.model,
      calculation: recovered.calculation,
      comparison: recovered.comparison,
      origin: "recovered",
      step: isStepId(recovered.activeStep) ? recovered.activeStep : "scope",
      experience: recovered.experience,
    });
  }

  async function openLibraryAssessment(
    assessment: StoredAssessment,
  ): Promise<void> {
    await enterAssessment({
      model: assessment.session.model,
      calculation: assessment.session.calculation,
      comparison: assessment.session.comparison,
      origin: "opened",
      step: isStepId(assessment.session.activeStep)
        ? assessment.session.activeStep
        : "scope",
      experience: assessment.session.experience,
    });
  }

  async function saveCurrentToLibrary(): Promise<void> {
    if (!model || origin === "demo") return;
    try {
      const session: AssessmentSession = {
        sessionSchemaVersion: "1.0.0",
        savedAt: new Date().toISOString(),
        origin:
          origin === "opened"
            ? "opened"
            : origin === "recovered"
              ? "recovered"
              : "new",
        activeStep,
        experience,
        model,
        calculation,
        comparison,
      };
      const stored = await saveAssessmentToLibrary(session);
      setLibrary(await listStoredAssessments());
      setLibrarySavedAt(stored.savedAt);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save this assessment to the library",
      );
    }
  }

  async function discardRecovery(): Promise<void> {
    await clearAssessmentSession();
    setRecovered(null);
    setAutosaveAt(null);
  }

  function assessmentHome(): void {
    setWorkspaceOpen(false);
    setError(null);
  }

  function downloadWorkingFile(): void {
    if (!model || origin === "demo") return;
    const session: AssessmentSession = {
      sessionSchemaVersion: "1.0.0",
      savedAt: new Date().toISOString(),
      origin:
        origin === "opened"
          ? "opened"
          : origin === "recovered"
            ? "recovered"
            : "new",
      activeStep,
      experience,
      model,
      calculation,
      comparison,
    };
    saveFile(
      `${safeFilename(model.name)}.capacity-assessment.json`,
      serializeAssessmentSession(session),
    );
  }

  async function handleWorkbenchModelChange(
    next: CapacityModel,
  ): Promise<void> {
    const invalidatesCalculation = calculationInputsChanged(model, next);
    const hadResults = Boolean(calculation || comparison);
    setModel(next);
    setLibrarySavedAt(null);
    if (invalidatesCalculation) {
      setCalculation(null);
      setComparison(null);
      if (hadResults) setResultsStale(true);
    }
    setError(null);
    await checkModel(next);
  }

  async function runCalculation(): Promise<void> {
    if (!model) return;
    try {
      setBusy("calculating");
      setError(null);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const result = await calculateModel(model, baselineScenarioId);
      setCalculation(result);
      setComparison(null);
      setResultsStale(false);
      setActiveStep("capacity");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calculation failed");
    } finally {
      setBusy(null);
    }
  }

  function updateRecoveryModel(next: CapacityModel): void {
    setModel(next);
    setComparison(null);
  }

  function selectStep(step: StepId): void {
    setActiveStep(step);
    setWorkbenchTarget(null);
    const url = new URL(window.location.href);
    url.searchParams.set("step", step);
    url.searchParams.delete("entity");
    url.searchParams.delete("record");
    window.history.replaceState(null, "", url);
  }

  function returnFromWorkbench(
    target: NonNullable<WorkbenchTarget["returnTo"]>,
  ): void {
    setWorkbenchTarget(null);
    setActiveStep(target.step);
  }

  if (!workspaceOpen) {
    return (
      <LaunchPad
        recovered={recovered}
        library={library}
        busy={busy !== null}
        error={error}
        onResume={() => void resumeAssessment()}
        onDemo={() => void loadDemo()}
        onNew={(input) => void startNew(input)}
        onOpen={(file) => void openFile(file)}
        onOpenLibrary={(assessment) => void openLibraryAssessment(assessment)}
        onDiscardRecovery={() => void discardRecovery()}
      />
    );
  }

  const counts = validation?.counts;
  const issueCount = validation?.issues?.length ?? 0;
  const warningCount =
    decisionCalculation?.issues.filter((issue) => issue.severity === "warning")
      .length ?? 0;
  const openLogCount =
    model?.actionLog?.filter(
      (entry) => !["verified", "cancelled"].includes(entry.status),
    ).length ?? 0;
  const demo = origin === "demo";

  return (
    <div
      className={`app-shell ${experience === "expert" ? "expert-mode" : "guided-mode"}`}
    >
      <header className="topbar">
        <div>
          <span className="eyebrow">
            Supplier Capacity Assessment & Verification
          </span>
          <h1>Capacity Assurance</h1>
        </div>
        <div className="topbar-actions">
          <span className={`assessment-mode-badge ${demo ? "demo" : "local"}`}>
            {demo ? "Synthetic demo" : "Local assessment"}
          </span>
          {!demo ? (
            <span className="autosave-state">
              {librarySavedAt
                ? `Library saved ${new Date(librarySavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : autosaveAt
                ? `Saved locally ${new Date(autosaveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Local recovery active"}
            </span>
          ) : null}
          <div
            className="experience-toggle"
            role="group"
            aria-label="Interface mode"
          >
            <button
              type="button"
              className={experience === "guided" ? "active" : ""}
              onClick={() => setExperience("guided")}
            >
              Guided
            </button>
            <button
              type="button"
              className={experience === "expert" ? "active" : ""}
              onClick={() => setExperience("expert")}
            >
              Expert
            </button>
          </div>
          <div className="topbar-file-actions">
            <button
              className="secondary light"
              type="button"
              disabled={demo || !model?.supplier || !model.assessmentDate}
              onClick={() => void saveCurrentToLibrary()}
            >
              Save to assessment library
            </button>
            <button
              className="secondary light"
              type="button"
              disabled={demo || !model}
              onClick={downloadWorkingFile}
            >
              Save assessment file
            </button>
            <button
              className="secondary light"
              type="button"
              onClick={assessmentHome}
            >
              Assessment home
            </button>
          </div>
        </div>
      </header>
      <div className="workspace">
        <aside>
          <div className="assessment-id">
            <span>Current assessment</span>
            <strong>{model?.name ?? "Loading…"}</strong>
            <small>
              {model?.supplier
                ? `${model.supplier.supplierName} · ${model.supplier.supplierId}${model.supplier.site ? ` · ${model.supplier.site}` : ""}`
                : "Supplier identity not set"}
            </small>
            <small>
              {model
                ? `${model.assessmentDate ?? "Undated"} · ${model.horizonStart} → ${model.horizonEnd}`
                : ""}
            </small>
          </div>
          <StepNav active={activeStep} onSelect={selectStep} />
          <div className="sidebar-note">
            <strong>Data stays local</strong>
            <p>
              The calculation engine runs in this browser. Exported files move
              only when you choose to move them.
            </p>
          </div>
        </aside>
        <main>
          {demo ? (
            <div className="demo-warning">
              <div>
                <strong>Synthetic demonstration data</strong>
                <span>
                  Northstar is fictional. Do not use this model as supplier
                  evidence.
                </span>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={assessmentHome}
              >
                Start a real assessment
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="error-panel">
              <strong>Action required</strong>
              <span>{error}</span>
            </div>
          ) : null}
          <StatusBanner
            validation={validation}
            calculation={calculation}
            stale={resultsStale}
          />
          {activeStep === "scope" ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow blue">Step 1</span>
                  <h2>Frame one supplier-capacity decision</h2>
                </div>
                <p>
                  Define what commitment is being verified, which site is in
                  scope, and what planning horizon the supplier must support.
                </p>
              </div>
              <div className="callout navy">
                <span>Assessment question</span>
                <strong>
                  Can this supplier support committed demand, what constraint
                  fails first, and what recovery closes the gap credibly?
                </strong>
              </div>
              <div className="metric-grid four">
                <Metric
                  label="Products"
                  value={counts?.products ?? model?.products.length ?? "—"}
                  note="Supplier product scope"
                />
                <Metric
                  label="Work areas"
                  value={
                    counts?.resourceGroups ??
                    model?.resourceGroups.length ??
                    "—"
                  }
                  note="People, machines, tooling, space"
                />
                <Metric
                  label="Demand records"
                  value={counts?.demandRecords ?? model?.demand.length ?? "—"}
                  note="Time-phased requirements"
                />
                <Metric
                  label="Open actions"
                  value={openLogCount}
                  note="Data, risk, and follow-up"
                />
              </div>
              <div className="two-column">
                <article className="card">
                  <h3>Local assessment mode</h3>
                  <ul>
                    <li>Calculations run in this browser.</li>
                    <li>
                      Supplier files are not uploaded by the Pages application.
                    </li>
                    <li>
                      A local recovery snapshot is maintained automatically.
                    </li>
                    <li>
                      The working assessment can be downloaded and reopened.
                    </li>
                  </ul>
                </article>
                <article className="card">
                  <h3>Field target</h3>
                  <ul>
                    <li>Import supplier spreadsheets.</li>
                    <li>
                      Reach the first credible calculation in under one hour.
                    </li>
                    <li>
                      Explain every critical period back to demand and routing.
                    </li>
                    <li>Leave with a portable evidence package.</li>
                  </ul>
                </article>
              </div>
              <div className="panel-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={() => selectStep("data")}
                >
                  Build the supplier model
                </button>
              </div>
            </section>
          ) : null}

          {activeStep === "data" && model ? (
            <ModelWorkbench
              model={model}
              baselineScenarioId={baselineScenarioId}
              scope={experience === "expert" ? "all" : "core-data"}
              target={workbenchTarget}
              onModelChange={handleWorkbenchModelChange}
              onBack={() => selectStep("scope")}
              onContinue={() => selectStep("readiness")}
              onReturn={returnFromWorkbench}
            />
          ) : null}

          {activeStep === "readiness" ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow blue">Step 3</span>
                  <h2>Decide whether the supplier inputs are good enough</h2>
                </div>
                <p>
                  Unknown values are allowed. Hidden uncertainty is not.
                  Blocking issues cannot appear as healthy capacity.
                </p>
              </div>
              <div
                className={`readiness-score ${validation?.valid ? "ready" : "blocked"}`}
              >
                <div>
                  <span>Structural readiness</span>
                  <strong>
                    {validation?.valid ? "Ready to calculate" : "Blocked"}
                  </strong>
                </div>
                <div className="score-ring">
                  {validation?.valid ? "✓" : issueCount}
                </div>
              </div>
              <div className="metric-grid four">
                <Metric
                  label="Calendars"
                  value={model?.calendars.length ?? "—"}
                  note="Working time"
                />
                <Metric
                  label="People and machines"
                  value={model?.resources.length ?? "—"}
                  note="Effective capacity"
                />
                <Metric
                  label="Products / routes"
                  value={`${model?.products.length ?? 0} / ${counts?.routingRevisions ?? 0}`}
                  note="Hours per part"
                />
                <Metric
                  label="Blocking issues"
                  value={validation?.valid ? 0 : issueCount}
                  note="Must be resolved"
                />
              </div>
              {validation?.issues?.length ? (
                <div className="issue-list large">
                  {validation.issues.map((issue, index) => (
                    <div key={`${issue.path}-${index}`}>
                      <strong>{issue.path || "Model"}</strong>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card">
                  <h3>What has been checked</h3>
                  <ul className="check-list">
                    <li>Required supplier records are present.</li>
                    <li>
                      References between products, work areas, and calendars are
                      valid.
                    </li>
                    <li>
                      Hours-per-part inputs preserve missing, zero, and
                      not-applicable states.
                    </li>
                    <li>
                      Rejected recovery actions cannot enter the calculation.
                    </li>
                  </ul>
                </div>
              )}
              <div className="panel-actions split">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => selectStep("data")}
                >
                  Back
                </button>
                <button
                  className="primary"
                  type="button"
                  disabled={!validation?.valid || busy !== null}
                  onClick={() => selectStep("analysis")}
                >
                  Continue to calculation
                </button>
              </div>
            </section>
          ) : null}

          {activeStep === "analysis" ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow blue">Step 4</span>
                  <h2>
                    Place the work when it must occur—not only when it ships
                  </h2>
                </div>
                <p>
                  The engine positions each product’s people and machine
                  requirements against the supplier calendar before comparing
                  load with available capacity.
                </p>
              </div>
              <div className="flow-strip">
                <div>
                  <span>1</span>
                  <strong>Demand</strong>
                  <small>Customer ship dates</small>
                </div>
                <i>→</i>
                <div>
                  <span>2</span>
                  <strong>Hours per part</strong>
                  <small>Applicable work only</small>
                </div>
                <i>→</i>
                <div>
                  <span>3</span>
                  <strong>Lead time</strong>
                  <small>Work shifted earlier</small>
                </div>
                <i>→</i>
                <div>
                  <span>4</span>
                  <strong>Capacity</strong>
                  <small>People and machines</small>
                </div>
                <i>→</i>
                <div>
                  <span>5</span>
                  <strong>Constraint</strong>
                  <small>What fails first</small>
                </div>
              </div>
              <div className="analysis-ready">
                <div>
                  <span>Scenario</span>
                  <strong>
                    {model?.scenarios.find(
                      (scenario) => scenario.id === baselineScenarioId,
                    )?.name ?? baselineScenarioId}
                  </strong>
                </div>
                <div>
                  <span>Horizon</span>
                  <strong>
                    {model?.horizonStart} → {model?.horizonEnd}
                  </strong>
                </div>
                <div>
                  <span>Resolution</span>
                  <strong>{model?.planningGranularity}</strong>
                </div>
                <button
                  className="primary large"
                  type="button"
                  disabled={!model || !validation?.valid || busy !== null}
                  onClick={() => void runCalculation()}
                >
                  {busy === "calculating"
                    ? "Calculating…"
                    : "Run baseline calculation"}
                </button>
              </div>
              {model && weeklyScaleWarning(model) ? <div className="callout amber"><span>Large weekly model</span><strong>{weeklyScaleWarning(model)}</strong></div> : null}
              <div className="panel-actions split">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => selectStep("readiness")}
                >
                  Back
                </button>
                {calculation ? (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => selectStep("capacity")}
                  >
                    Open Capacity Analysis
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeStep === "capacity" && model && calculation ? (
            <AnalysisExplorer
              model={model}
              baseline={calculation}
              comparison={comparison}
              onBack={() => selectStep("analysis")}
              onContinue={() => selectStep("footprint")}
            />
          ) : null}
          {activeStep === "capacity" && (!model || !calculation) ? (
            <section className="panel">
              <div className="empty-state">
                <h3>Run the baseline calculation again</h3>
                <p>
                  Capacity Analysis needs current period results before charts
                  and drill-through can be displayed.
                </p>
                <button
                  className="primary"
                  type="button"
                  onClick={() => selectStep("analysis")}
                >
                  Go to calculation
                </button>
              </div>
            </section>
          ) : null}

          {activeStep === "footprint" && model ? (
            <ModelWorkbench
              model={model}
              baselineScenarioId={
                calculation?.demandSourceScenarioId ?? baselineScenarioId
              }
              scope="footprint"
              target={workbenchTarget}
              onModelChange={handleWorkbenchModelChange}
              onBack={() => selectStep("capacity")}
              onContinue={() => selectStep("recovery")}
              onReturn={returnFromWorkbench}
            />
          ) : null}
          {activeStep === "recovery" && model ? (
            <RecoveryPanel
              model={model}
              comparison={comparison}
              onModelChange={updateRecoveryModel}
              onComparison={(value) => {
                setComparison(value);
                setResultsStale(false);
              }}
              onBack={() => selectStep("footprint")}
              onContinue={() => selectStep("actions")}
            />
          ) : null}
          {activeStep === "actions" && model ? (
            <ModelWorkbench
              model={model}
              baselineScenarioId={baselineScenarioId}
              scope="actions"
              target={workbenchTarget}
              onModelChange={handleWorkbenchModelChange}
              onBack={() => selectStep("recovery")}
              onContinue={() => selectStep("decision")}
              onReturn={returnFromWorkbench}
            />
          ) : null}

          {activeStep === "decision" ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow blue">Step 9</span>
                  <h2>Publish the supplier-capacity finding</h2>
                </div>
                <p>
                  The decision states whether the plan is supportable, what
                  recovery was tested, and what exposure remains.
                </p>
              </div>
              {!decisionCalculation || !decision ? (
                <div className="empty-state">
                  <h3>No defensible finding exists yet</h3>
                  <p>
                    Run the baseline, review the critical constraints, test
                    recovery, and return with current results.
                  </p>
                  <button
                    className="primary"
                    type="button"
                    onClick={() =>
                      selectStep(calculation ? "capacity" : "analysis")
                    }
                  >
                    {calculation
                      ? "Open Capacity Analysis"
                      : "Go to calculation"}
                  </button>
                </div>
              ) : (
                <>
                  {comparison && baselineDecision ? (
                    <div className="decision-comparison-strip">
                      <div>
                        <span>Baseline</span>
                        <strong>{baselineDecision.headline}</strong>
                        <small>
                          {baselineDecision.governing
                            ? `${names[baselineDecision.governing.resourceGroupId] ?? baselineDecision.governing.resourceGroupId} · ${formatPercent(baselineDecision.governing.utilization)}`
                            : "No governing constraint"}
                        </small>
                      </div>
                      <div className="scenario-arrow">→</div>
                      <div>
                        <span>Recovery</span>
                        <strong>{decision.headline}</strong>
                        <small>
                          {decision.governing
                            ? `${names[decision.governing.resourceGroupId] ?? decision.governing.resourceGroupId} · ${formatPercent(decision.governing.utilization)}`
                            : "No governing constraint"}
                        </small>
                      </div>
                    </div>
                  ) : null}
                  <div className={`decision-hero ${decision.state}`}>
                    <span>
                      {comparison
                        ? "Recovery finding"
                        : decision.state === "gap"
                          ? "Capacity gap"
                          : decision.state === "watch"
                            ? "Constrained plan"
                            : decision.state === "ready"
                              ? "Supportable plan"
                              : "Incomplete finding"}
                    </span>
                    <h3>{decision.headline}</h3>
                    <p>{decision.explanation}</p>
                  </div>
                  <div className="metric-grid four">
                    <Metric
                      label="Governing constraint"
                      value={
                        decision.governing
                          ? (names[decision.governing.resourceGroupId] ??
                            decision.governing.resourceGroupId)
                          : "—"
                      }
                    />
                    <Metric
                      label="Peak utilization"
                      value={formatPercent(
                        decision.governing?.utilization ?? null,
                      )}
                    />
                    <Metric
                      label="Gap periods remaining"
                      value={
                        comparison?.remainingGapPeriods ??
                        decisionCalculation.results.filter((row) => row.gap < 0)
                          .length
                      }
                    />
                    <Metric
                      label="Open actions"
                      value={openLogCount}
                      note="Unresolved assessment work"
                    />
                  </div>
                  {model ? (
                    <ConstraintExplorer
                      model={model}
                      scenarioId={decisionCalculation.scenarioId}
                      rows={constraints}
                      title="Highest-risk periods after recovery"
                      subtitle="Explain each period back to demand, product work, standards, and timing."
                      onReviseRecovery={() => selectStep("recovery")}
                    />
                  ) : null}
                </>
              )}
              <div className="panel-actions split">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => selectStep("actions")}
                >
                  Back to Action Log
                </button>
                {model && comparison ? (
                  <DecisionExports
                    model={model}
                    comparison={comparison}
                    history={supplierHistory}
                  />
                ) : (
                  <button className="primary" type="button" disabled>
                    Decision package unavailable
                  </button>
                )}
              </div>
            </section>
          ) : null}
        </main>
      </div>
      <footer>
        <span>
          Capacity Assurance · Supplier Capacity Assessment & Verification
        </span>
        <span>
          {demo
            ? "Synthetic demonstration"
            : "Local assessment mode · data stays in this browser"}{" "}
          · Engine and model 1.0.0 · {warningCount} warning
          {warningCount === 1 ? "" : "s"}
        </span>
      </footer>
    </div>
  );
}
