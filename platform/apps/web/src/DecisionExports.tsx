import { useState } from "react";
import type { CapacityModel, ScenarioComparisonResult } from "@capacity/domain";
import { generateDecisionReport } from "./api.js";

interface DecisionExportsProps {
  model: CapacityModel;
  comparison: ScenarioComparisonResult;
}

type ExportFormat = "html" | "json";

function saveFile(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function DecisionExports({ model, comparison }: DecisionExportsProps) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: ExportFormat): Promise<void> {
    setBusy(format);
    setError(null);
    try {
      const report = await generateDecisionReport(
        model,
        comparison.baselineScenarioId,
        comparison.comparisonScenarioId,
        format,
      );
      saveFile(report.filename, report.mimeType, report.content);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision package could not be generated");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="decision-exports">
      <div className="export-buttons">
        <button className="secondary" type="button" disabled={busy !== null} onClick={() => void download("json")}>
          {busy === "json" ? "Preparing…" : "Save portable assessment"}
        </button>
        <button className="primary" type="button" disabled={busy !== null} onClick={() => void download("html")}>
          {busy === "html" ? "Preparing…" : "Download executive report"}
        </button>
      </div>
      {error ? <small className="export-error">{error}</small> : null}
    </div>
  );
}
