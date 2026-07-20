import type { CalculationResult, CapacityModel, ScenarioComparisonResult } from "@capacity/domain";
import { formatPercent, summarizeDecision } from "./analysis.js";
import DecisionExports from "./DecisionExports.js";
import "./findings.css";

interface FindingsPresentationProps {
  model: CapacityModel;
  baseline: CalculationResult;
  comparison: ScenarioComparisonResult | null;
  onClose: () => void;
}

function resourceQuantityAt(model: CapacityModel, groupId: string, date: string): number {
  return model.resources
    .filter(resource => resource.resourceGroupId === groupId)
    .filter(resource => !resource.effectiveFrom || resource.effectiveFrom <= date)
    .filter(resource => !resource.effectiveTo || resource.effectiveTo >= date)
    .reduce((sum, resource) => sum + resource.quantity, 0);
}

function equivalentLabel(kind: string, value: number): string {
  const amount = value < 10 ? value.toFixed(1) : Math.ceil(value).toString();
  if (kind === "labor") return `${amount} effective FTE`;
  if (kind === "equipment") return `${amount} machine equivalent${value > 1.05 ? "s" : ""}`;
  if (kind === "tooling") return `${amount} tool equivalent${value > 1.05 ? "s" : ""}`;
  if (kind === "skill") return `${amount} qualified resource equivalent${value > 1.05 ? "s" : ""}`;
  return `${amount} resource equivalent${value > 1.05 ? "s" : ""}`;
}

function formatNative(value: number, unit: string): string {
  const amount = Math.abs(value) >= 100 ? Math.round(Math.abs(value)).toLocaleString() : Math.abs(value).toFixed(1);
  if (unit === "squareFeet") return `${amount} sq ft`;
  if (unit === "palletPositions") return `${amount} pallet positions`;
  return `${amount} ${unit}`;
}

export default function FindingsPresentation({ model, baseline, comparison, onClose }: FindingsPresentationProps) {
  const result = comparison?.comparison ?? baseline;
  const names = Object.fromEntries(model.resourceGroups.map(group => [group.id, group.name]));
  const summary = summarizeDecision(result, names);
  const governing = summary.governing;
  const group = governing ? model.resourceGroups.find(item => item.id === governing.resourceGroupId) : undefined;
  const shortage = governing ? Math.max(0, -governing.gap) : 0;
  const availableQuantity = governing ? resourceQuantityAt(model, governing.resourceGroupId, governing.periodStart) : 0;
  const capacityPerEquivalent = governing && availableQuantity > 0 ? governing.capacity / availableQuantity : 0;
  const additionalEquivalent = shortage > 0 && capacityPerEquivalent > 0 ? shortage / capacityPerEquivalent : null;
  const applied = new Set(comparison?.appliedActionIds ?? []);
  const actions = (model.scenarioActions ?? []).filter(action => applied.has(action.id));
  const baselineSummary = summarizeDecision(baseline, names);

  return <div className="findings-backdrop" role="dialog" aria-modal="true" aria-label="Supplier capacity findings">
    <section className={`findings-sheet ${summary.state}`}>
      <header className="findings-header"><div><span className="eyebrow">Supplier Capacity Finding</span><h1>{model.name}</h1><p>{model.horizonStart} to {model.horizonEnd} · Prepared in local assessment mode</p></div><button className="secondary" type="button" onClick={onClose}>Close findings</button></header>

      <div className="findings-verdict"><span>{summary.state === "gap" ? "Commitment not supported" : summary.state === "watch" ? "Conditional commitment" : summary.state === "ready" ? "Modeled plan supportable" : "Finding incomplete"}</span><h2>{summary.headline}</h2><p>{summary.explanation}</p></div>

      <div className="findings-grid">
        <article><span>Governing constraint</span><strong>{governing ? names[governing.resourceGroupId] ?? governing.resourceGroupId : "Not established"}</strong><small>{group ? `${group.kind} · measured in ${group.capacityUnit}` : "Resolve missing model inputs"}</small></article>
        <article><span>When it binds</span><strong>{governing?.periodStart ?? "—"}</strong><small>{governing ? `Through ${governing.periodEnd}` : "No loaded period available"}</small></article>
        <article><span>Peak utilization</span><strong>{formatPercent(governing?.utilization ?? null)}</strong><small>{governing ? `${governing.load.toFixed(1)} load / ${governing.capacity.toFixed(1)} capacity` : "—"}</small></article>
        <article><span>{shortage > 0 ? "Capacity shortage" : "Remaining margin"}</span><strong>{governing && group ? formatNative(governing.gap, group.capacityUnit) : "—"}</strong><small>{additionalEquivalent !== null && group ? `Approximately ${equivalentLabel(group.kind, additionalEquivalent)} at current effectiveness` : shortage > 0 ? "No usable per-resource conversion is available" : "Positive modeled capacity balance"}</small></article>
      </div>

      {comparison ? <section className="findings-recovery"><div className="findings-section-title"><div><span>Recovery result</span><h3>What changes the finding</h3></div><strong>{comparison.remainingGapPeriods} gap period{comparison.remainingGapPeriods === 1 ? "" : "s"} remain</strong></div><div className="finding-comparison"><div><span>Before recovery</span><strong>{baselineSummary.headline}</strong><small>{formatPercent(baselineSummary.governing?.utilization ?? null)} peak utilization</small></div><i>→</i><div><span>After recovery</span><strong>{summary.headline}</strong><small>{comparison.resolvedGapPeriods} gap period{comparison.resolvedGapPeriods === 1 ? "" : "s"} closed</small></div></div><div className="findings-actions">{actions.length ? actions.slice(0, 5).map(action => <div key={action.id}><span>{action.status}</span><strong>{action.name}</strong><small>{action.effectiveFrom}{action.owner ? ` · Owner: ${action.owner}` : ""}</small></div>) : <p>No included recovery actions are recorded.</p>}</div></section> : <section className="findings-recovery empty"><div><span>Recovery not tested</span><h3>The current screen shows the baseline finding.</h3><p>Build a dated recovery plan to show the supplier what closes the gap and what exposure remains.</p></div></section>}

      <footer className="findings-footer"><div><strong>Discussion standard</strong><span>This is a modeled capacity finding, not a guarantee. Confirm source data, action ownership, timing, and operating readiness before publishing a commitment.</span></div>{comparison ? <DecisionExports model={model} comparison={comparison} /> : null}</footer>
    </section>
  </div>;
}
