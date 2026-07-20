import { useRef, useState } from "react";
import type { AssessmentSession } from "./assessmentSession.js";
import "./launch-pad.css";

interface NewAssessmentInput {
  name: string;
  horizonStart: string;
  horizonEnd: string;
  planningGranularity: "week" | "month";
}

interface LaunchPadProps {
  recovered: AssessmentSession | null;
  busy: boolean;
  error: string | null;
  onResume: () => void;
  onDemo: () => void;
  onNew: (input: NewAssessmentInput) => void;
  onOpen: (file: File) => void;
  onDiscardRecovery: () => void;
}

function defaultDates(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(Date.UTC(today.getUTCFullYear() + 1, 11, 31));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function LaunchPad({ recovered, busy, error, onResume, onDemo, onNew, onOpen, onDiscardRecovery }: LaunchPadProps) {
  const dates = defaultDates();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("Supplier Capacity Assessment");
  const [horizonStart, setHorizonStart] = useState(dates.start);
  const [horizonEnd, setHorizonEnd] = useState(dates.end);
  const [planningGranularity, setPlanningGranularity] = useState<"week" | "month">("month");
  const fileRef = useRef<HTMLInputElement>(null);
  const dateError = horizonEnd < horizonStart ? "The horizon end must be on or after the start." : null;

  return <div className="launch-shell">
    <header className="launch-header">
      <div><span className="eyebrow">Supplier Capacity Assessment & Verification</span><h1>Capacity Assurance</h1><p>Build a defensible capacity finding in the room with the supplier.</p></div>
      <div className="local-mode-claim"><strong>Local assessment mode</strong><span>The engine runs in this browser. Supplier data is not uploaded unless you deliberately connect or export it.</span></div>
    </header>

    <main className="launch-content">
      <section className="launch-hero">
        <span className="eyebrow blue">Start in minutes</span>
        <h2>Open the assessment you were working on, start a clean supplier visit, or inspect the synthetic demonstration.</h2>
        <p>The browser keeps a recoverable local snapshot while you work. Downloaded assessment files can be reopened on another authorized computer.</p>
      </section>

      {error ? <div className="error-panel"><strong>Assessment could not be opened</strong><span>{error}</span></div> : null}

      <div className={`launch-options ${recovered ? "has-recovery" : ""}`}>
        {recovered ? <article className="launch-card recovery-card"><span className="launch-card-tag">Recovered locally</span><h3>{recovered.model.name}</h3><p>Last saved {new Date(recovered.savedAt).toLocaleString()} · {recovered.model.horizonStart} to {recovered.model.horizonEnd}</p><div className="launch-card-actions"><button className="primary" type="button" disabled={busy} onClick={onResume}>Resume assessment</button><button className="secondary" type="button" disabled={busy} onClick={onDiscardRecovery}>Discard recovery</button></div></article> : null}

        <article className="launch-card"><span className="launch-card-tag">Field work</span><h3>New assessment</h3><p>Create a clean local model with a standard calendar and editable starter records.</p><button className="primary" type="button" disabled={busy} onClick={() => setShowNew(value => !value)}>{showNew ? "Close setup" : "Start new assessment"}</button></article>

        <article className="launch-card"><span className="launch-card-tag">Continue work</span><h3>Open assessment file</h3><p>Reopen a saved assessment file or a portable evidence snapshot from a completed decision.</p><button className="primary" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Choose assessment file</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) onOpen(file); event.currentTarget.value = ""; }} /></article>

        <article className="launch-card demo-card"><span className="launch-card-tag">Synthetic data</span><h3>Open Northstar demo</h3><p>Review the complete workflow using a fictional supplier. Demo data is always visibly marked and never replaces your local recovery.</p><button className="secondary" type="button" disabled={busy} onClick={onDemo}>{busy ? "Opening…" : "Open demonstration"}</button></article>
      </div>

      {showNew ? <section className="new-assessment-form"><div><span className="eyebrow blue">Assessment setup</span><h3>Name the decision and establish the planning horizon.</h3></div><div className="new-assessment-grid"><label>Assessment name<input value={name} onChange={event => setName(event.target.value)} autoFocus /></label><label>Resolution<select value={planningGranularity} onChange={event => setPlanningGranularity(event.target.value as "week" | "month")}><option value="month">Monthly</option><option value="week">Weekly</option></select></label><label>Horizon start<input type="date" value={horizonStart} onChange={event => setHorizonStart(event.target.value)} /></label><label>Horizon end<input type="date" value={horizonEnd} onChange={event => setHorizonEnd(event.target.value)} /></label></div>{dateError ? <p className="form-error">{dateError}</p> : null}<div className="launch-card-actions"><button className="primary" type="button" disabled={busy || !name.trim() || Boolean(dateError)} onClick={() => onNew({ name, horizonStart, horizonEnd, planningGranularity })}>Create local assessment</button><button className="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</button></div></section> : null}
    </main>

    <footer className="launch-footer"><span>Supplier capacity assessment · capacity verification · recovery planning</span><span>Local-first field workflow</span></footer>
  </div>;
}
