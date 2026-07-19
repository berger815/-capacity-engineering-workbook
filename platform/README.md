# Capacity Assurance Platform

This directory contains the market-scale successor to the legacy single-file Capacity & Engineering Workbook.

The root `index.html` remains the reference implementation for proven domain behavior. It is not the architectural foundation of this platform.

## Product boundary

The platform answers:

> Can this plant or supplier meet committed demand, what constraint fails first, and what recovery action closes the gap credibly?

It is not an ERP, MRP, MES, finite scheduler, dispatching system, or accounting product.

## Architecture

- `packages/domain` — vendor-neutral canonical manufacturing-capacity model, scenario actions, comparisons, and runtime validation.
- `packages/engine` — deterministic, headless baseline, recovery, lead-time, and capacity calculation engine.
- `packages/fixtures` — canonical synthetic regression and demonstration models.
- `packages/importer` — dependency-free CSV parsing, reusable demand mappings, row validation, and control totals.
- `packages/reporting` — portable assessment snapshots and standalone printable executive decision reports.
- `apps/api` — runnable HTTP import, validation, calculation, comparison, and reporting service.
- `apps/web` — guided Assessment Studio from scope through recovery and decision export.
- `database/migrations` — normalized PostgreSQL persistence contract, including recovery action and comparison lineage.

## Modeling principles

1. Sparse routing assignments replace product-by-department matrices.
2. `notApplicable`, `missing`, `zero`, and numeric `value` are distinct states.
3. Products may have multiple effective-dated routing revisions.
4. Product operations map to product-specific lead-time phases.
5. Resources use working calendars with date exceptions, not annual capacity divided by twelve.
6. Labor, equipment, skills, tooling, space, external services, and other constraints share a common resource abstraction.
7. Source-system identifiers are aliases; no ERP vendor owns the core model.
8. The calculation engine is independent of UI, persistence, and integrations.
9. Published decisions remain reproducible through source snapshots, mapping versions, scenario versions, action snapshots, engine versions, and input digests.
10. Imports report control totals and rejected rows; bad data never silently becomes zero.
11. The guided interface uses progressive disclosure: decision first, details on demand.
12. A recovery scenario never mutates its protected baseline.

## Current vertical slice

The working slice includes:

- canonical organization, product, routing, resource, calendar, scenario, demand, and recovery-action entities;
- runtime schema validation, target validation, scenario lineage checks, and action governance;
- monthly or weekly periods;
- date-based calendar capacity;
- product-specific lead-time phase allocation;
- sparse routing load;
- setup/batch load support;
- governing-constraint identification;
- full Northstar v2 canonical fixture with four distinct routes and 48 monthly demand records;
- governed Northstar recovery fixture with dated equipment, labor, and temporary capacity actions;
- baseline demand inheritance without copied or mutated demand records;
- baseline-versus-recovery comparison with load, capacity, gap, and utilization deltas;
- dependency-free CSV parser with quoted fields, escaped quotes, BOM, CRLF, and header validation;
- reusable demand column mappings with ID, name, or external-key product matching;
- ISO and U.S. date parsing, row-level errors, and reconciliation totals;
- atomic scenario demand replacement with explicit partial-import opt-in;
- runnable HTTP endpoints for health, fixture retrieval, validation, demand import, calculation, comparison, and reporting;
- guided browser workflow: Scope → Data → Readiness → Analysis → Recovery → Decision;
- named recovery actions with target, effective dates, owner, approval state, confidence, and audit-preserving rejection;
- executive decision summary and ranked constraint-period table;
- downloadable standalone HTML executive report;
- downloadable portable JSON assessment containing the complete model, comparison, action lineage, assumptions, and results;
- responsive desktop, tablet, and phone layout;
- PostgreSQL migrations for identity, tenancy, model entities, source lineage, imports, calculations, recovery actions, action snapshots, scenario comparisons, results, and audit;
- CI execution of every migration against a clean PostgreSQL 16 service;
- automated domain, engine, fixture, importer, API, reporting, HTTP integration, and web tests.

## Commands

```bash
corepack enable
cd platform
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm dev
```

`pnpm dev` starts the API on `127.0.0.1:3000` and the Assessment Studio on `127.0.0.1:4173`.

## API contract

- `GET /health`
- `GET /v1/fixtures/northstar-v2`
- `POST /v1/validate` with either a canonical model or `{ "model": ... }`
- `POST /v1/import/demand/preview` with `{ "model": ..., "scenarioId": "...", "csv": "...", "mapping": {...} }`
- `POST /v1/import/demand/apply` with the preview payload and optional `acceptPartial: true`
- `POST /v1/calculate` with `{ "model": ..., "scenarioId": "..." }`
- `POST /v1/compare` with `{ "model": ..., "baselineScenarioId": "...", "comparisonScenarioId": "..." }`
- `POST /v1/report/decision` with the comparison payload and `format: "html" | "json"`

All import, calculation, comparison, and report input is runtime-validated before it changes a model or reaches the engine.

## Build gates

Before this branch is ready to merge:

- CI is green.
- All PostgreSQL migrations execute against a clean database.
- Northstar synthetic baseline and recovery cases are represented in the canonical schema.
- Golden calculations reproduce the intended lead-time, routing, and recovery behavior.
- Missing and not-applicable inputs cannot silently become zero.
- Demand import exposes accepted/rejected rows and control totals.
- The API validates every import, calculation, comparison, and report request.
- The guided workflow reaches a baseline-versus-recovery decision without direct API use.
- The decision can be exported as both an executive report and a portable assessment snapshot.
- No changes are made to the legacy `index.html`.

## Remaining R0 work

1. Deeper golden-result reconciliation against v6.86 expected values.
2. Product, routing, resource, and calendar table import mappings.
3. PostgreSQL repository implementation for saved assessments and immutable runs.
4. Authentication, tenant enforcement, and deployment configuration.
5. Performance benchmark at the R0 market-entry scale.
6. Explainable drill-through from a constraint to contributing products, operations, standards, and demand records.
