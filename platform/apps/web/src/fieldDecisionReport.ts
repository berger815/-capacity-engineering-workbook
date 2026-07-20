import type { DecisionPackage, DecisionPackageRisk } from "@capacity/reporting";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percent(value: number | null): string {
  if (value === null) return "—";
  if (!Number.isFinite(value)) return "No capacity";
  return `${Math.round(value * 100)}%`;
}

function riskMetric(
  item: DecisionPackageRisk | null,
  field: "resource" | "period" | "gap" | "utilization",
): string {
  if (!item) return "—";
  if (field === "resource") return item.resourceName;
  if (field === "period") return `${item.periodStart} to ${item.periodEnd}`;
  if (field === "gap") return Math.abs(item.gap).toFixed(1);
  return percent(item.utilization);
}

function riskRows(risks: DecisionPackageRisk[]): string {
  return risks
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.resourceName)}</td><td>${escapeHtml(item.periodStart)}</td><td class="num">${item.load.toFixed(1)}</td><td class="num">${item.capacity.toFixed(1)}</td><td class="num ${item.gap < 0 ? "bad-text" : ""}">${item.gap.toFixed(1)}</td><td class="num">${escapeHtml(percent(item.utilization))}</td></tr>`,
    )
    .join("");
}

function riskSection(heading: string, risks: DecisionPackageRisk[]): string {
  return `<h4>${escapeHtml(heading)}</h4><table><thead><tr><th>Constraint</th><th>Period</th><th class="num">Load</th><th class="num">Capacity</th><th class="num">Gap</th><th class="num">Utilization</th></tr></thead><tbody>${riskRows(risks) || '<tr><td colspan="6">No loaded risk periods recorded.</td></tr>'}</tbody></table>`;
}

export function renderFieldDecisionPackageHtml(
  decisionPackage: DecisionPackage,
): string {
  const decision = decisionPackage.decision;
  const governing =
    decision.recoveryGoverningConstraint ??
    decision.baselineGoverningConstraint;
  const model = decisionPackage.assessmentSnapshot.model;
  const group = governing
    ? model.resourceGroups.find((item) => item.id === governing.resourceGroupId)
    : undefined;
  const verdictLabel =
    decision.classification === "supportable"
      ? "Modeled plan supportable"
      : decision.classification === "conditional"
        ? "Conditional commitment"
        : decision.classification === "notSupportable"
          ? "Commitment not supported"
          : "Finding incomplete";
  const verdict = `${verdictLabel} · This is a modeled finding—not a guarantee`;
  const statusClass =
    decision.classification === "supportable"
      ? "good"
      : decision.classification === "conditional"
        ? "watch"
        : decision.classification === "notSupportable"
          ? "bad"
          : "incomplete";
  const unit = group?.capacityUnit ?? "capacity units";
  const actionRows = decisionPackage.actions
    .map(
      (action) =>
        `<tr><td><strong>${escapeHtml(action.name)}</strong></td><td>${escapeHtml(action.target)}</td><td>${escapeHtml(action.effect)}</td><td>${escapeHtml(action.effectiveFrom)}${action.effectiveTo ? ` → ${escapeHtml(action.effectiveTo)}` : " onward"}</td><td>${escapeHtml(action.owner ?? "—")}</td><td>${escapeHtml(action.status)}</td><td>${action.included ? "Included" : "Not included"}</td></tr>`,
    )
    .join("");
  const openActionRows = decisionPackage.openActions
    .map(
      (action) =>
        `<tr><td><strong>${escapeHtml(action.note)}</strong><br><small>Raised ${escapeHtml(action.createdAt.slice(0, 10))}${action.raisedInAssessmentId ? ` · ${escapeHtml(action.raisedInAssessmentId)}` : ""}</small></td><td>${escapeHtml(action.ageDays)} days</td><td>${escapeHtml(action.owner ?? "—")}</td><td>${escapeHtml(action.dueDate ?? "—")}</td><td>${escapeHtml(action.status)}</td></tr>`,
    )
    .join("");
  const verificationRows = decisionPackage.verification
    .map(
      (action) =>
        `<tr><td>${escapeHtml(action.note)}</td><td>${escapeHtml(action.verifiedAt?.slice(0, 10) ?? "—")}</td><td>${escapeHtml(action.verifiedBy ?? "—")}</td><td>${escapeHtml(action.evidenceNote ?? "No evidence note recorded")}</td></tr>`,
    )
    .join("");
  const historyRows = decisionPackage.supplierHistory
    .map(
      (point) =>
        `<li><strong>${escapeHtml(point.assessmentDate)}</strong><span>${escapeHtml(point.decisionState)}</span></li>`,
    )
    .join("");
  const assumptionRows = decisionPackage.assumptions
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.scenarioId)}</td><td>${escapeHtml(item.key)}</td><td>${escapeHtml(item.value)}</td></tr>`,
    )
    .join("");
  const directRisks = decisionPackage.topRemainingRisks.filter(
    (item) => !item.indirect,
  );
  const indirectRisks = decisionPackage.topRemainingRisks.filter(
    (item) => item.indirect,
  );
  const supplier = model.supplier;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(decisionPackage.title)}</title><style>
:root{font-family:Inter,Arial,sans-serif;color:#17243a}*{box-sizing:border-box}body{margin:0;background:#e8edf3}.page{max-width:1120px;margin:24px auto;background:#fff;box-shadow:0 10px 32px rgba(13,29,52,.14)}.cover{padding:34px 42px 28px;background:#0d1d34;color:#fff}.category{font-size:9px;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#89bce4}.cover h1{font-size:31px;line-height:1.1;margin:7px 0}.cover p{margin:4px 0;color:#c9d7e5;font-size:11px}.verdict{padding:28px 42px;color:#fff}.verdict.good{background:#176b4a}.verdict.watch{background:#9b6509}.verdict.bad{background:#963535}.verdict.incomplete{background:#536275}.verdict span{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;opacity:.82}.verdict h2{font-size:29px;margin:7px 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;padding:20px 32px}.metric{border:1px solid #d6dfe8;border-radius:10px;padding:16px}.metric span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#66758b;font-weight:800}.metric strong{display:block;font-size:19px;line-height:1.2;margin:7px 0}.metric small,small{font-size:9px;color:#67798d}.body{padding:0 32px 34px}h3.section{font-size:18px;margin:28px 0 10px;border-bottom:2px solid #173c63;padding-bottom:7px}h4{margin:17px 0 7px;color:#334e6b}.history{display:flex;gap:12px;list-style:none;padding:0}.history li{flex:1;border-top:4px solid #2d76b3;background:#f2f6fa;padding:12px}.history span{display:block;margin-top:5px;text-transform:uppercase;font-size:9px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#eef3f7;text-transform:uppercase;color:#617287;font-size:8px;letter-spacing:.06em}th,td{padding:9px 10px;border-bottom:1px solid #e0e6ed;text-align:left;vertical-align:top}.num{text-align:right;font-variant-numeric:tabular-nums}.bad-text{color:#a83232;font-weight:800}.lineage{padding:14px;background:#f4f7fa;border-radius:8px;font-size:9px;color:#596b80;overflow-wrap:anywhere}.disclaimer{margin-top:24px;padding:13px 15px;border:1px solid #d6dfe8;background:#fafbfd;font-size:9px;line-height:1.5;color:#627387}footer{padding:14px 32px;border-top:1px solid #d6dfe8;color:#758498;font-size:9px;display:flex;justify-content:space-between}@media print{body{background:#fff}.page{margin:0;max-width:none;box-shadow:none}.verdict,.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}.body{page-break-before:always}}@media(max-width:720px){.page{margin:0}.cover,.verdict{padding-left:24px;padding-right:24px}.metrics{grid-template-columns:1fr 1fr;padding:16px}.body{padding:0 16px 28px}.history{display:block}table{font-size:9px}}
</style></head><body><main class="page"><header class="cover"><span class="category">Supplier Capacity Assessment &amp; Verification</span><h1>${escapeHtml(model.name)}</h1><p>${supplier ? `${escapeHtml(supplier.supplierName)} · ${escapeHtml(supplier.supplierId)}${supplier.site ? ` · ${escapeHtml(supplier.site)}` : ""}` : "Supplier identity not recorded"} · Assessment ${escapeHtml(model.assessmentDate ?? "undated")}</p><p>Generated ${escapeHtml(decisionPackage.generatedAt)} · Planning horizon ${escapeHtml(model.horizonStart)} to ${escapeHtml(model.horizonEnd)}</p></header><section class="verdict ${statusClass}"><span>${escapeHtml(verdict)}</span><h2>${escapeHtml(decision.statement)}</h2></section><section class="metrics"><div class="metric"><span>Governing constraint</span><strong>${escapeHtml(riskMetric(governing, "resource"))}</strong><small>${escapeHtml(group ? `${group.indirect ? "Indirect" : "Direct"} · ${group.kind} · ${unit}` : "No governing resource established")}</small></div><div class="metric"><span>Binding period</span><strong>${escapeHtml(governing?.periodStart ?? "—")}</strong><small>${escapeHtml(riskMetric(governing, "period"))}</small></div><div class="metric"><span>Peak utilization</span><strong>${escapeHtml(riskMetric(governing, "utilization"))}</strong><small>${governing ? `${governing.load.toFixed(1)} load / ${governing.capacity.toFixed(1)} capacity` : "—"}</small></div><div class="metric"><span>${governing && governing.gap < 0 ? "Capacity shortage" : "Remaining margin"}</span><strong>${escapeHtml(riskMetric(governing, "gap"))}</strong><small>${escapeHtml(unit)} · ${decision.remainingGapPeriods} gap period${decision.remainingGapPeriods === 1 ? "" : "s"} remain</small></div></section><div class="body">${decisionPackage.supplierHistory.length > 1 ? `<h3 class="section">Supplier history</h3><ol class="history">${historyRows}</ol>` : ""}<h3 class="section">Open actions</h3><table><thead><tr><th>Action / origin</th><th>Age</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${openActionRows || '<tr><td colspan="5">No open actions recorded.</td></tr>'}</tbody></table><h3 class="section">Verification</h3><table><thead><tr><th>Action</th><th>Verified</th><th>Verified by</th><th>Evidence</th></tr></thead><tbody>${verificationRows || '<tr><td colspan="4">No actions verified in this assessment.</td></tr>'}</tbody></table><h3 class="section">Recovery action register</h3><table><thead><tr><th>Action</th><th>Target</th><th>Effect</th><th>Effective</th><th>Owner</th><th>Status</th><th>Calculation</th></tr></thead><tbody>${actionRows || '<tr><td colspan="7">No recovery actions recorded.</td></tr>'}</tbody></table><h3 class="section">Highest remaining risks</h3>${riskSection("Direct labor, equipment, tooling, and space", directRisks)}${riskSection("Indirect and engineering capacity", indirectRisks)}<h3 class="section">Assumptions</h3><table><thead><tr><th>Scenario</th><th>Assumption</th><th>Value</th></tr></thead><tbody>${assumptionRows || '<tr><td colspan="3">No explicit scenario assumptions recorded.</td></tr>'}</tbody></table><h3 class="section">Evidence lineage</h3><div class="lineage">Model ${escapeHtml(model.modelId)} · Schema ${escapeHtml(model.schemaVersion)} · Baseline ${escapeHtml(decision.baselineScenarioId)} · Recovery ${escapeHtml(decision.comparisonScenarioId)} · Applied action IDs ${escapeHtml(decisionPackage.lineage.appliedActionIds.join(", ") || "none")} · Package ${escapeHtml(decisionPackage.packageId)}</div><div class="disclaimer"><strong>Use limitation:</strong> Aggregate capacity does not guarantee good flow. Layout, batching, sequencing, or queue effects can still create excessive lead time; record these as qualitative findings and corrective actions.</div></div><footer><span>Capacity Assurance · Supplier Capacity Assessment &amp; Verification</span><span>Portable evidence package</span></footer></main></body></html>`;
}
