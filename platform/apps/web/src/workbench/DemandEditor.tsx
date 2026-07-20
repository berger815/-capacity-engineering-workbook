import { useMemo, useState } from "react";
import type { WorkbenchEditorProps } from "./editorTypes.js";
import { createWorkbenchId as newId, optionalText } from "./editorTypes.js";

interface DemandEditorProps extends WorkbenchEditorProps {
  baselineScenarioId: string;
}

export default function DemandEditor({ draft, mutate, targetRecordId, onSelectRecord, baselineScenarioId }: DemandEditorProps) {
  const [productFilter, setProductFilter] = useState("all");
  const [query, setQuery] = useState("");
  const records = useMemo(() => draft.demand
    .filter(record => record.scenarioId === baselineScenarioId)
    .filter(record => productFilter === "all" || record.productId === productFilter)
    .filter(record => `${record.id} ${record.customerOrProgram ?? ""} ${record.shipDate}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.shipDate.localeCompare(b.shipDate)), [draft.demand, baselineScenarioId, productFilter, query]);

  const total = records.reduce((sum, record) => sum + record.quantity, 0);

  function addDemand(): void {
    const productId = productFilter === "all" ? draft.products[0]?.id : productFilter;
    if (!productId) return;
    const id = newId("demand");
    mutate("demand", next => next.demand.push({ id, scenarioId: baselineScenarioId, productId, shipDate: next.horizonStart, quantity: 0, demandClass: "forecast", sourceSystem: "Assessment Studio edit" }));
    onSelectRecord?.(id);
  }

  return <div className="workbench-editor">
    <div className="editor-toolbar"><label>Product<select value={productFilter} onChange={event => setProductFilter(event.target.value)}><option value="all">All products</option>{draft.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Find record<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Date, program, or ID" /></label><span className="toolbar-metric"><strong>{total.toLocaleString()}</strong> units shown</span><button className="secondary" type="button" onClick={addDemand} disabled={!draft.products.length}>Add demand row</button></div>
    <div className="table-card"><div className="card-title-row"><div><h3>Demand records</h3><small>Ship-date demand. The engine places work earlier through routing lead-time phases.</small></div></div><div className="table-wrap"><table><thead><tr><th>ID</th><th>Product</th><th>Ship date</th><th className="number">Quantity</th><th>Class</th><th>Customer / program</th><th>Source</th><th /></tr></thead><tbody>{records.map(record => <tr key={record.id} className={targetRecordId === record.id ? "selected-row" : ""} onClick={() => onSelectRecord?.(record.id)}><td><code>{record.id}</code></td><td><select value={record.productId} onChange={event => mutate("demand", next => { const found = next.demand.find(item => item.id === record.id); if (found) found.productId = event.target.value; })}>{draft.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></td><td><input type="date" value={record.shipDate} onChange={event => mutate("demand", next => { const found = next.demand.find(item => item.id === record.id); if (found) found.shipDate = event.target.value; })} /></td><td><input className="number-input" type="number" min="0" step="1" value={record.quantity} onChange={event => mutate("demand", next => { const found = next.demand.find(item => item.id === record.id); if (found) found.quantity = Number(event.target.value); })} /></td><td><select value={record.demandClass ?? "forecast"} onChange={event => mutate("demand", next => { const found = next.demand.find(item => item.id === record.id); if (found) found.demandClass = event.target.value as NonNullable<typeof found.demandClass>; })}>{["firm","forecast","upside","downside"].map(value => <option key={value} value={value}>{value}</option>)}</select></td><td><input value={record.customerOrProgram ?? ""} onChange={event => mutate("demand", next => { const found = next.demand.find(item => item.id === record.id); if (found) optionalText(found as unknown as Record<string, unknown>, "customerOrProgram", event.target.value); })} /></td><td><input value={record.sourceSystem ?? ""} onChange={event => mutate("demand", next => { const found = next.demand.find(item => item.id === record.id); if (found) optionalText(found as unknown as Record<string, unknown>, "sourceSystem", event.target.value); })} /></td><td><button className="text-danger" type="button" onClick={event => { event.stopPropagation(); mutate("demand", next => { next.demand = next.demand.filter(item => item.id !== record.id); }); }}>Remove</button></td></tr>)}</tbody></table></div>{records.length === 0 ? <div className="empty-state compact"><h3>No matching demand</h3><p>Add a demand row or change the filters.</p></div> : null}</div>
  </div>;
}
