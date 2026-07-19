import type { CalculationResult, CapacityModel, ScenarioComparisonResult } from "@capacity/domain";
import AnalysisExplorerReadOnly from "./AnalysisExplorerReadOnly.js";
import type { WorkbenchTarget } from "./workbench/entityDefinitions.js";

interface AnalysisExplorerProps {
  model: CapacityModel;
  baseline: CalculationResult;
  comparison: ScenarioComparisonResult | null;
  onBack: () => void;
  onContinue: () => void;
}

function openWorkbench(target: WorkbenchTarget): void {
  window.sessionStorage.setItem("capacity-workbench-target", JSON.stringify(target));
  const stepLabel = target.entity === "footprint" ? "Footprint" : target.entity === "actions" ? "Action Log" : "Data";
  const step = [...document.querySelectorAll<HTMLButtonElement>(".step-button")].find(button => button.querySelector("strong")?.textContent === stepLabel);
  step?.click();
  const url = new URL(window.location.href);
  url.searchParams.set("step", target.entity === "footprint" ? "footprint" : target.entity === "actions" ? "actions" : "data");
  url.searchParams.set("entity", target.entity);
  if (target.recordId) url.searchParams.set("record", target.recordId); else url.searchParams.delete("record");
  window.history.replaceState(null, "", url);
}

export default function AnalysisExplorer(props: AnalysisExplorerProps) {
  return <AnalysisExplorerReadOnly {...props} onEditModel={openWorkbench} />;
}
