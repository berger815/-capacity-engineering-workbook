import { useEffect, useMemo, useState } from "react";
import type { CalculationResult, CapacityModel } from "@capacity/domain";
import {
  applyDemandImport,
  calculateModel,
  loadNorthstar,
  previewDemandImport,
  validateModel,
  type DemandImportPreview,
  type DemandMapping,
  type ModelValidationResult,
} from "./api.js";
import { formatPercent, rankConstraintPeriods, summarizeDecision } from "./analysis.js";

const steps = [
  { id: "scope", label: "Scope", help: "Define the decision and boundaries" },
  { id: "data", label: "Data", help: "Load and reconcile the facts" },
  { id: "readiness", label: "Readiness", help: "Resolve decision-blocking gaps" },
  { id: "analysis", label: "Analysis", help: "Calculate load and capacity" },
  { id: "decision", label: "Decision", help: "See what fails first and why" },
] as const;

type StepId = typeof steps[number]["id"];

type BusyState = "loading" | "validating" | "previewing" | "applying" | "calculating" | null;

const defaultMapping: DemandMapping = {
  productColumn: "Product",
  shipDateColumn: "Ship Date",
  quantityColumn: "Quantity",
  productMatch: "name",
  dateFormat: "iso",
  defaultDemandClass: "forecast",
  sourceSystem: "Assessment Studio CSV",
};

function sampleCsv(model: CapacityModel): string {
  const rows = model.products.slice(0, 4).map((product, index) =>
    `"${product.name}",2027-${String(index + 1).padStart(2, "0")}-28,${25 + index * 10}`,
  );
  return ["Product,Ship Date,Quantity", ...rows].join("\n");
}

function resourceNameMap(model: CapacityModel | null): Record<string, string> {
  return Object.fromEntries(model?.resourceGroups.map(group => [group.id, group.name]) ?? []);
}

function StepNav({ active, onSelect }: { active: StepId; onSelect: (step: StepId) => void }) {
  return (
    <nav className="step-nav" aria-label="Assessment workflow">
      {steps.map((step, index) => (
        <button
          key={step.id}
          className={`step-button ${active === step.id ? "active" : ""}`}
          onClick={() => onSelect(step.id)}
          type="button"
        >
          <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
          <span><strong>{step.label}</strong><small>{step.help}</small></span>
        </button>
      ))}
    </nav>
  );
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function StatusBanner({ validation, calculation }: { validation: ModelValidationResult | null; calculation: CalculationResult | null }) {
  if (!validation) return <div className="status-banner neutral">Model readiness has not been checked.</div>;
  if (!validation.valid) return <div className="status-banner bad">The model has blocking validation issues.</div>;
  if (!calculation) return <div className="status-banner good">The model is structurally ready. Run the analysis to establish the decision.</div>;
  const blocking = calculation.issues.filter(issue => issue.severity === "error").length;
  return blocking > 0
    ? <div className="status-banner bad">Calculation completed with {blocking} blocking issue{blocking === 1 ? "" : "s"}.</div>
    : <div className="status-banner good">Calculation completed with no blocking model errors.</div>;
}

export default function App() {
  const [activeStep, setActiveStep] = useState<StepId>("scope");
  const [model, setModel] = useState<CapacityModel | null>(null);
  const [validation, setValidation] = useState<ModelValidationResult | null>(null);
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [busy, setBusy] = useState<BusyState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<DemandMapping>(defaultMapping);
  const [preview, setPreview] = useState<DemandImportPreview | null>(null);
  const [acceptPartial, setAcceptPartial] = useState(false);

  const names = useMemo(() => resourceNameMap(model), [model]);
  const decision = calculation ? summarizeDecision(calculation, names) : null;
  const constraints = calculation ? rankConstraintPeriods(calculation, 10) : [];
  const scenarioId = model?.scenarios[0]?.id ?? "baseline";

  async function checkModel(candidate: CapacityModel): Promise<void> {
    setBusy("validating");
    const result = await validateModel(candidate);
    setValidation(result);
    setBusy(null);
  }

  async function loadDemo(): Promise<void> {
    try {
      setBusy("loading");
      setError(null);
      const fixture = await loadNorthstar();
      setModel(fixture);
      setCsv(sampleCsv(fixture));
      setCalculation(null);
      setPreview(null);
      await checkModel(fixture);
    } catch (caught) {
      setBusy(null);
      setError(caught instanceof Error ? caught.message : "Unable to load the assessment model");
    }
  }

  useEffect(() => { void loadDemo(); }, []);

  async function runCalculation(): Promise<void> {
    if (!model) return;
    try {
      setBusy("calculating");
      setError(null);
      const result = await calculateModel(model, scenarioId);
      setCalculation(result);
      setActiveStep("decision");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calculation failed");
    } finally {
      setBusy(null);
    }
  }

  async function previewImport(): Promise<void> {
    if (!model) return;
    try {
      setBusy("previewing");
      setError(null);
      setPreview(await previewDemandImport(model, scenarioId, csv, mapping));
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "Import preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function applyImport(): Promise<void> {
    if (!model) return;
    try {
      setBusy("applying");
      setError(null);
      const applied = await applyDemandImport(model, scenarioId, csv, mapping, acceptPartial);
      setModel(applied.model);
      setPreview(applied.import);
      setCalculation(null);
      await checkModel(applied.model);
      setActiveStep("readiness");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import could not be applied");
      setBusy(null);
    }
  }

  function updateMapping<Key extends keyof DemandMapping>(key: Key, value: DemandMapping[Key]): void {
    setMapping(current => ({ ...current, [key]: value }));
    setPreview(null);
  }

  async function readFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
  }

  const counts = validation?.counts;
  const issueCount = validation?.issues?.length ?? 0;
  const warningCount = calculation?.issues.filter(issue => issue.severity === "warning").length ?? 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Manufacturing Capacity Assurance</span>
          <h1>Assessment Studio</h1>
        </div>
        <div className="topbar-actions">
          <span className={`connection ${error ? "offline" : ""}`}>{error ? "Needs attention" : "Local assessment"}</span>
          <button className="secondary light" type="button" onClick={() => void loadDemo()} disabled={busy !== null}>Reset Northstar demo</button>
        </div>
      </header>

      <div className="workspace">
        <aside>
          <div className="assessment-id">
            <span>Current assessment</span>
            <strong>{model?.name ?? "Loading…"}</strong>
            <small>{model ? `${model.horizonStart} → ${model.horizonEnd}` : ""}</small>
          </div>
          <StepNav active={activeStep} onSelect={setActiveStep} />
          <div className="sidebar-note">
            <strong>The decision question</strong>
            <p>Can this operation meet committed demand, what fails first, and what must change?</p>
          </div>
        </aside>

        <main>
          {error ? <div className="error-panel"><strong>Action required</strong><span>{error}</span></div> : null}
          <StatusBanner validation={validation} calculation={calculation} />

          {activeStep === "scope" && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow blue">Step 1</span><h2>Frame one decision, not the entire factory</h2></div>
                <p>Northstar is a synthetic supplier assessment. It is loaded automatically so the workflow can be reviewed without customer data.</p>
              </div>
              <div className="callout navy">
                <span>Decision</span>
                <strong>Can Northstar support the 2027 demand ramp across its labor, equipment, tooling, and skill constraints?</strong>
              </div>
              <div className="metric-grid four">
                <Metric label="Products" value={counts?.products ?? model?.products.length ?? "—"} note="Four distinct routes" />
                <Metric label="Resource groups" value={counts?.resourceGroups ?? model?.resourceGroups.length ?? "—"} note="Labor and equipment" />
                <Metric label="Demand records" value={counts?.demandRecords ?? model?.demand.length ?? "—"} note="Monthly 2027 ramp" />
                <Metric label="Planning periods" value={model?.planningGranularity === "month" ? "Monthly" : "Weekly"} note="Calendar-aware" />
              </div>
              <div className="two-column">
                <article className="card"><h3>Included</h3><ul><li>Northstar site and scoped product portfolio</li><li>Applicable product routes only</li><li>Working calendars and resource effectiveness</li><li>Baseline 2027 demand scenario</li></ul></article>
                <article className="card"><h3>Intentionally excluded</h3><ul><li>Daily production scheduling</li><li>Inventory accounting and procurement</li><li>Unrelated plant products and resources</li><li>Any employer, supplier, or customer data</li></ul></article>
              </div>
              <div className="panel-actions"><button className="primary" type="button" onClick={() => setActiveStep("data")}>Review the data</button></div>
            </section>
          )}

          {activeStep === "data" && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow blue">Step 2</span><h2>Load demand without hiding bad rows</h2></div>
                <p>Preview first. The system reconciles record counts and quantities before replacing the scenario.</p>
              </div>
              <div className="metric-grid four">
                <Metric label="Current demand rows" value={model?.demand.length ?? "—"} />
                <Metric label="Current quantity" value={model ? model.demand.reduce((sum, row) => sum + row.quantity, 0).toLocaleString() : "—"} />
                <Metric label="Earliest ship date" value={model?.demand.map(row => row.shipDate).sort()[0] ?? "—"} />
                <Metric label="Latest ship date" value={model?.demand.map(row => row.shipDate).sort().at(-1) ?? "—"} />
              </div>
              <div className="import-layout">
                <div className="card import-card">
                  <div className="card-title-row"><h3>Demand CSV</h3><label className="file-button">Choose file<input type="file" accept=".csv,text/csv" onChange={event => void readFile(event.target.files?.[0])} /></label></div>
                  <textarea value={csv} onChange={event => { setCsv(event.target.value); setPreview(null); }} aria-label="Demand CSV content" spellCheck={false} />
                  <small>Required columns are mapped below. The example can be edited directly.</small>
                </div>
                <div className="card mapping-card">
                  <h3>Column mapping</h3>
                  <label>Product column<input value={mapping.productColumn} onChange={event => updateMapping("productColumn", event.target.value)} /></label>
                  <label>Ship-date column<input value={mapping.shipDateColumn} onChange={event => updateMapping("shipDateColumn", event.target.value)} /></label>
                  <label>Quantity column<input value={mapping.quantityColumn} onChange={event => updateMapping("quantityColumn", event.target.value)} /></label>
                  <label>Match product by<select value={mapping.productMatch} onChange={event => updateMapping("productMatch", event.target.value as DemandMapping["productMatch"])}><option value="name">Product name</option><option value="id">Canonical ID</option><option value="externalKey">External key</option></select></label>
                  <label>Date format<select value={mapping.dateFormat ?? "iso"} onChange={event => updateMapping("dateFormat", event.target.value as "iso" | "us")}><option value="iso">YYYY-MM-DD</option><option value="us">MM/DD/YYYY</option></select></label>
                  <button className="primary full" type="button" disabled={!model || busy !== null || csv.trim().length === 0} onClick={() => void previewImport()}>{busy === "previewing" ? "Checking…" : "Preview and reconcile"}</button>
                </div>
              </div>

              {preview ? (
                <div className={`preview ${preview.controlTotals.rejectedRows > 0 ? "has-errors" : "clean"}`}>
                  <div className="preview-head"><div><span>Import reconciliation</span><strong>{preview.controlTotals.acceptedRows} of {preview.controlTotals.inputRows} rows accepted</strong></div><div><span>Accepted quantity</span><strong>{preview.controlTotals.totalQuantity.toLocaleString()}</strong></div></div>
                  <div className="metric-grid four compact">
                    <Metric label="Accepted" value={preview.controlTotals.acceptedRows} />
                    <Metric label="Rejected" value={preview.controlTotals.rejectedRows} />
                    <Metric label="First delivery" value={preview.controlTotals.earliestShipDate ?? "—"} />
                    <Metric label="Last delivery" value={preview.controlTotals.latestShipDate ?? "—"} />
                  </div>
                  {preview.issues.length > 0 ? <div className="issue-list">{preview.issues.slice(0, 8).map(issue => <div key={`${issue.rowNumber}-${issue.code}`}><strong>Row {issue.rowNumber}</strong><span>{issue.message}</span></div>)}</div> : <p className="success-copy">All rows passed the mapping and data checks.</p>}
                  <label className="checkbox"><input type="checkbox" checked={acceptPartial} onChange={event => setAcceptPartial(event.target.checked)} /> Allow accepted rows to replace the scenario even when other rows are rejected</label>
                  <button className="primary" type="button" onClick={() => void applyImport()} disabled={busy !== null || (preview.controlTotals.rejectedRows > 0 && !acceptPartial)}>{busy === "applying" ? "Applying…" : "Apply imported demand"}</button>
                </div>
              ) : null}
              <div className="panel-actions split"><button className="secondary" type="button" onClick={() => setActiveStep("scope")}>Back</button><button className="primary" type="button" onClick={() => setActiveStep("readiness")}>Check readiness</button></div>
            </section>
          )}

          {activeStep === "readiness" && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow blue">Step 3</span><h2>Decide whether the inputs are good enough</h2></div>
                <p>Unknown values are allowed. Hidden uncertainty is not. Blocking issues cannot appear as healthy capacity.</p>
              </div>
              <div className={`readiness-score ${validation?.valid ? "ready" : "blocked"}`}>
                <div><span>Structural readiness</span><strong>{validation?.valid ? "Ready to calculate" : "Blocked"}</strong></div>
                <div className="score-ring">{validation?.valid ? "✓" : issueCount}</div>
              </div>
              <div className="metric-grid four">
                <Metric label="Products" value={counts?.products ?? "—"} note="Each has an effective route" />
                <Metric label="Routes" value={counts?.routingRevisions ?? "—"} note="Sparse and revision-aware" />
                <Metric label="Resources" value={counts?.resourceGroups ?? "—"} note="Calendar-linked" />
                <Metric label="Blocking issues" value={validation?.valid ? 0 : issueCount} note="Must be resolved" />
              </div>
              {validation?.issues?.length ? <div className="issue-list large">{validation.issues.map((issue, index) => <div key={`${issue.path}-${index}`}><strong>{issue.path || "Model"}</strong><span>{issue.message}</span></div>)}</div> : <div className="card"><h3>What has been checked</h3><ul className="check-list"><li>Required model sections are present.</li><li>Identifiers are unique.</li><li>Lead-time phases are ordered correctly.</li><li>Demand and scenario records are structurally valid.</li><li>Missing, zero, and not-applicable requirements remain distinct.</li></ul></div>}
              <div className="panel-actions split"><button className="secondary" type="button" onClick={() => setActiveStep("data")}>Back</button><button className="primary" type="button" disabled={!validation?.valid || busy !== null} onClick={() => setActiveStep("analysis")}>Continue to analysis</button></div>
            </section>
          )}

          {activeStep === "analysis" && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow blue">Step 4</span><h2>Place work when it must occur—not only when it ships</h2></div>
                <p>The engine shifts each product’s labor and equipment requirements into its applicable lead-time phases, then compares period load against calendar capacity.</p>
              </div>
              <div className="flow-strip">
                <div><span>1</span><strong>Demand</strong><small>Customer ship dates</small></div><i>→</i>
                <div><span>2</span><strong>Routing</strong><small>Applicable work only</small></div><i>→</i>
                <div><span>3</span><strong>Lead time</strong><small>Work shifted earlier</small></div><i>→</i>
                <div><span>4</span><strong>Capacity</strong><small>Calendars and effectiveness</small></div><i>→</i>
                <div><span>5</span><strong>Constraint</strong><small>What fails first</small></div>
              </div>
              <div className="callout amber"><span>Why this matters</span><strong>A 2027 shipment can consume welding, machining, or tooling capacity in 2026. Annual averages can therefore look healthy while the launch still fails.</strong></div>
              <div className="analysis-ready">
                <div><span>Scenario</span><strong>{model?.scenarios.find(scenario => scenario.id === scenarioId)?.name ?? scenarioId}</strong></div>
                <div><span>Horizon</span><strong>{model?.horizonStart} → {model?.horizonEnd}</strong></div>
                <div><span>Resolution</span><strong>{model?.planningGranularity}</strong></div>
                <button className="primary large" type="button" disabled={!model || !validation?.valid || busy !== null} onClick={() => void runCalculation()}>{busy === "calculating" ? "Calculating…" : "Run capacity analysis"}</button>
              </div>
              <div className="panel-actions"><button className="secondary" type="button" onClick={() => setActiveStep("readiness")}>Back</button></div>
            </section>
          )}

          {activeStep === "decision" && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow blue">Step 5</span><h2>Make the capacity decision</h2></div>
                <p>This view is intentionally narrower than a general dashboard: governing constraint, exposure, confidence, and required next action.</p>
              </div>
              {!calculation || !decision ? (
                <div className="empty-state"><h3>No analysis has been run</h3><p>Complete readiness and run the model before making a commitment.</p><button className="primary" type="button" onClick={() => setActiveStep("analysis")}>Go to analysis</button></div>
              ) : (
                <>
                  <div className={`decision-hero ${decision.state}`}>
                    <span>{decision.state === "gap" ? "Capacity gap" : decision.state === "watch" ? "Constrained plan" : decision.state === "ready" ? "Supportable plan" : "Incomplete decision"}</span>
                    <h3>{decision.headline}</h3>
                    <p>{decision.explanation}</p>
                  </div>
                  <div className="metric-grid four">
                    <Metric label="Governing resource" value={decision.governing ? names[decision.governing.resourceGroupId] ?? decision.governing.resourceGroupId : "—"} />
                    <Metric label="Peak utilization" value={formatPercent(decision.governing?.utilization ?? null)} />
                    <Metric label="Governing period" value={decision.governing?.periodStart ?? "—"} note={decision.governing?.periodEnd ? `through ${decision.governing.periodEnd}` : undefined} />
                    <Metric label="Model warnings" value={warningCount} note="Non-blocking assumptions" />
                  </div>
                  <div className="two-column decision-columns">
                    <article className="card"><h3>Recommendation</h3><p>{decision.state === "gap" ? "Do not publish the current demand commitment. Build a recovery scenario against the governing capacity driver and verify its in-service timing." : decision.state === "watch" ? "Treat the plan as conditional. Challenge demand, standards, effectiveness, and downtime before committing the narrow margin." : decision.state === "ready" ? "The modeled baseline is supportable. Preserve the input snapshot and assumptions before publishing the commitment." : "Resolve the blocking data issues before making a capacity decision."}</p></article>
                    <article className="card"><h3>What to inspect next</h3><ul><li>Products and operations contributing to the peak</li><li>Calendar, effectiveness, and capacity basis</li><li>Demand source and confidence</li><li>Recovery actions that affect the governing driver</li></ul></article>
                  </div>
                  <div className="table-card">
                    <div className="card-title-row"><div><h3>Highest-risk periods</h3><small>Ranked across all modeled resource classes</small></div><button className="secondary" type="button" onClick={() => void runCalculation()} disabled={busy !== null}>Recalculate</button></div>
                    <div className="table-wrap"><table><thead><tr><th>Resource</th><th>Period</th><th className="number">Load</th><th className="number">Capacity</th><th className="number">Gap</th><th className="number">Utilization</th></tr></thead><tbody>{constraints.map(row => <tr key={`${row.resourceGroupId}-${row.periodStart}`}><td>{names[row.resourceGroupId] ?? row.resourceGroupId}</td><td>{row.periodStart}</td><td className="number">{row.load.toFixed(1)}</td><td className="number">{row.capacity.toFixed(1)}</td><td className={`number ${row.gap < 0 ? "negative" : ""}`}>{row.gap.toFixed(1)}</td><td className="number"><span className={`utilization ${row.utilization !== null && row.utilization > 1 ? "over" : ""}`}>{formatPercent(row.utilization)}</span></td></tr>)}</tbody></table></div>
                  </div>
                </>
              )}
              <div className="panel-actions split"><button className="secondary" type="button" onClick={() => setActiveStep("analysis")}>Back</button><button className="primary" type="button" disabled={!calculation}>Create recovery scenario <span className="coming">Next slice</span></button></div>
            </section>
          )}
        </main>
      </div>
      <footer><span>Capacity Assurance Platform · Synthetic data only</span><span>Engine and model version 1.0.0</span></footer>
    </div>
  );
}
