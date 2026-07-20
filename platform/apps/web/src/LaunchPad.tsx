import { useRef, useState } from "react";
import type { AssessmentSession, StoredAssessment } from "./assessmentSession.js";
import "./launch-pad.css";

interface NewAssessmentInput {
  name: string;
  supplierId: string;
  supplierName: string;
  site?: string;
  assessmentDate: string;
  horizonStart: string;
  horizonEnd: string;
  planningGranularity: "week" | "month";
  priorAssessmentId?: string;
  carryActions: boolean;
  reuseModel: boolean;
}

interface LaunchPadProps {
  recovered: AssessmentSession | null;
  library: StoredAssessment[];
  busy: boolean;
  error: string | null;
  onResume: () => void;
  onDemo: () => void;
  onNew: (input: NewAssessmentInput) => void;
  onOpen: (file: File) => void;
  onOpenLibrary: (assessment: StoredAssessment) => void;
  onDiscardRecovery: () => void;
}

function defaultDates(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(Date.UTC(today.getUTCFullYear() + 1, 11, 31));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function LaunchPad({ recovered, library, busy, error, onResume, onDemo, onNew, onOpen, onOpenLibrary, onDiscardRecovery }: LaunchPadProps) {
  const dates = defaultDates();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("Supplier Capacity Assessment");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [site, setSite] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [horizonStart, setHorizonStart] = useState(dates.start);
  const [horizonEnd, setHorizonEnd] = useState(dates.end);
  const [planningGranularity, setPlanningGranularity] = useState<"week" | "month">("month");
  const [carryActions, setCarryActions] = useState(true);
  const [reuseModel, setReuseModel] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const dateError = horizonEnd < horizonStart ? "The horizon end must be on or after the start." : null;
  const suppliers = [...new Map(library.map(item => [item.supplierId, item])).values()];
  const prior = library.filter(item => item.supplierId === supplierId.trim()).sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate))[0];

  return <div className="launch-shell">
    <header className="launch-header"><div><span className="eyebrow">Supplier Capacity Assessment & Verification</span><h1>Capacity Assurance</h1><p>Build a defensible capacity finding in the room with the supplier.</p></div><div className="local-mode-claim"><strong>Local assessment mode</strong><span>The engine runs in this browser. Supplier data is not uploaded unless you deliberately connect or export it.</span></div></header>
    <main className="launch-content">
      <section className="launch-hero"><span className="eyebrow blue">Start in minutes</span><h2>Resume field work, open supplier history, start a clean visit, or inspect the synthetic demonstration.</h2><p>The active session is recoverable automatically. The assessment library is saved explicitly and grouped by supplier.</p></section>
      {error ? <div className="error-panel"><strong>Assessment could not be opened</strong><span>{error}</span></div> : null}
      <div className={`launch-options ${recovered ? "has-recovery" : ""}`}>
        {recovered ? <article className="launch-card recovery-card"><span className="launch-card-tag">Recovered locally</span><h3>{recovered.model.name}</h3><p>Last saved {new Date(recovered.savedAt).toLocaleString()} · {recovered.model.horizonStart} to {recovered.model.horizonEnd}</p><div className="launch-card-actions"><button className="primary" type="button" disabled={busy} onClick={onResume}>Resume assessment</button><button className="secondary" type="button" disabled={busy} onClick={onDiscardRecovery}>Discard recovery</button></div></article> : null}
        <article className="launch-card"><span className="launch-card-tag">Field work</span><h3>New assessment</h3><p>Establish supplier identity now so actions can survive across visits.</p><button className="primary" type="button" disabled={busy} onClick={() => setShowNew(value => !value)}>{showNew ? "Close setup" : "Start new assessment"}</button></article>
        <article className="launch-card"><span className="launch-card-tag">Portable file</span><h3>Open assessment file</h3><p>Reopen a downloaded working file or evidence snapshot.</p><button className="primary" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Choose assessment file</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) onOpen(file); event.currentTarget.value = ""; }} /></article>
        <article className="launch-card demo-card"><span className="launch-card-tag">Synthetic data</span><h3>Open Northstar demo</h3><p>Review the complete workflow using a fictional supplier.</p><button className="secondary" type="button" disabled={busy} onClick={onDemo}>{busy ? "Opening…" : "Open demonstration"}</button></article>
        <article className="launch-card library-card"><span className="launch-card-tag">Longitudinal record</span><h3>Assessment library</h3><p>Decision state and open actions by supplier visit.</p>{library.length === 0 ? <small>No assessments have been explicitly saved to this browser yet.</small> : <div className="assessment-library-list">{suppliers.map(supplier => <div key={supplier.supplierId}><strong>{supplier.supplierName}</strong><small>{supplier.supplierId}{supplier.session.model.supplier?.site ? ` · ${supplier.session.model.supplier.site}` : ""}</small>{library.filter(item => item.supplierId === supplier.supplierId).map(item => <button type="button" key={item.assessmentId} onClick={() => onOpenLibrary(item)}><span>{item.assessmentDate}</span><b>{item.decisionState ?? "incomplete"}</b><em>{item.openActionCount} open action{item.openActionCount === 1 ? "" : "s"}</em></button>)}</div>)}</div>}</article>
      </div>
      {showNew ? <section className="new-assessment-form"><div><span className="eyebrow blue">Assessment setup</span><h3>Identify the supplier, visit, decision, and horizon.</h3></div><div className="new-assessment-grid">
        <label>Supplier ID<input value={supplierId} list="supplier-ids" onChange={event => { const value = event.target.value; setSupplierId(value); const match = suppliers.find(item => item.supplierId === value); if (match) { setSupplierName(match.supplierName); setSite(match.session.model.supplier?.site ?? ""); } }} /><datalist id="supplier-ids">{suppliers.map(item => <option key={item.supplierId} value={item.supplierId}>{item.supplierName}</option>)}</datalist></label>
        <label>Supplier name<input value={supplierName} onChange={event => setSupplierName(event.target.value)} /></label>
        <label>Site / plant<input value={site} onChange={event => setSite(event.target.value)} /></label>
        <label>Assessment date<input type="date" value={assessmentDate} onChange={event => setAssessmentDate(event.target.value)} /></label>
        <label>Assessment name<input value={name} onChange={event => setName(event.target.value)} autoFocus /></label>
        <label>Resolution<select value={planningGranularity} onChange={event => setPlanningGranularity(event.target.value as "week" | "month")}><option value="month">Monthly</option><option value="week">Weekly</option></select></label>
        <label>Horizon start<input type="date" value={horizonStart} onChange={event => setHorizonStart(event.target.value)} /></label>
        <label>Horizon end<input type="date" value={horizonEnd} onChange={event => setHorizonEnd(event.target.value)} /></label>
      </div>{prior ? <div className="dependency-note"><strong>Prior assessment found: {prior.assessmentDate}</strong><label className="checkbox"><input type="checkbox" checked={carryActions} onChange={event => setCarryActions(event.target.checked)} /> Carry forward actions not verified or cancelled</label><label className="checkbox"><input type="checkbox" checked={reuseModel} onChange={event => setReuseModel(event.target.checked)} /> Reassess from the prior supplier model</label></div> : null}{dateError ? <p className="form-error">{dateError}</p> : null}<div className="launch-card-actions"><button className="primary" type="button" disabled={busy || !name.trim() || !supplierId.trim() || !supplierName.trim() || !assessmentDate || Boolean(dateError)} onClick={() => onNew({ name, supplierId, supplierName, ...(site.trim() ? { site } : {}), assessmentDate, horizonStart, horizonEnd, planningGranularity, ...(prior ? { priorAssessmentId: prior.assessmentId } : {}), carryActions, reuseModel })}>Create local assessment</button><button className="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</button></div></section> : null}
    </main>
    <footer className="launch-footer"><span>Supplier capacity assessment · capacity verification · recovery planning</span><span>Local-first field workflow</span></footer>
  </div>;
}
