# Capacity Assurance Platform

This directory contains the market-scale successor to the legacy single-file Capacity & Engineering Workbook.

The root `index.html` remains the reference implementation for proven domain behavior. It is not the architectural foundation of this platform.

## Product boundary

The platform answers:

> Can this plant or supplier meet committed demand, what constraint fails first, why does it fail, and what recovery action closes the gap credibly?

It is a supplier capacity assessment and corrective-action product. It is not an ERP, MRP, MES, finite scheduler, dispatching system, accounting product, or discrete-event simulation.

The platform may carry planning-level WIP, dwell, footprint occupancy, program effort, supplier identity, assessment history, and corrective-action records needed to assess commitment credibility. It does not manage transactional inventory, costing, warehouse movements, production dispatch, or financial accounting. Planning WIP does not net demand unless a future, explicitly governed engine feature is specified and tested.

The engine sizes aggregate people, equipment, tooling, external-service, skill, and space constraints. It does not model line balance, takt, queue dynamics, layout congestion, batching, or detailed operation sequencing. A supplier may therefore have sufficient aggregate hours and still flow poorly; that limitation must be carried as a qualitative finding, lead-time risk, or action item rather than implied away by the capacity result. `RoutingOperation.sequence` is descriptive ordering only.

## Architecture

- `packages/domain` — vendor-neutral canonical manufacturing-capacity, program, supplier, scenario, comparison, explanation, footprint-planning, and assessment-governance contracts.
- `packages/engine` — deterministic baseline, recovery, lead-time, requirement-basis, capacity, comparison, and load-explanation engine.
- `packages/fixtures` — canonical synthetic regression and demonstration models.
- `packages/importer` — dependency-free CSV parsing, reusable entity mappings, row validation, reconciliation totals, canonical exporters, and versioned source profiles.
- `packages/reporting` — portable assessment snapshots and standalone printable executive decision reports.
- `apps/api` — HTTP import, validation, calculation, comparison, explanation, and reporting service.
- `apps/web` — local-first guided and expert Assessment Studio with assessment library, carry-forward, recovery, footprint, action tracking, explainability, and decision export.
- `database/migrations` — normalized PostgreSQL persistence contract for the later synchronized enterprise layer.

## Modeling principles

1. Sparse routing assignments replace product-by-department matrices.
2. `notApplicable`, `missing`, `zero`, and numeric `value` are distinct states.
3. Products may have multiple effective-dated routing revisions.
4. Product operations map to product-specific lead-time phases.
5. Resources use working calendars with date exceptions, not annual capacity divided by twelve.
6. Labor, equipment, skills, tooling, space, external services, and other constraints share a common resource abstraction.
7. Direct and indirect resource groups calculate identically but report separately.
8. Per-unit requirements follow demand; per-program and per-period requirements follow program dates and are never multiplied by part count or unit volume.
9. Source-system identifiers are aliases; no ERP vendor owns the core model.
10. The calculation engine is independent of UI, persistence, and integrations.
11. Published decisions remain reproducible through source snapshots, mapping versions, scenario versions, action snapshots, engine versions, and input digests.
12. Imports report control totals and rejected rows; bad data never silently becomes zero.
13. The interface supports guided and expert workflows with the same underlying model and controls.
14. A recovery scenario never mutates its protected baseline.
15. Every explained period load must reconcile to its calculated load, including program-based load.
16. Planning WIP and dwell inform footprint occupancy first; they do not silently alter demand or production-load timing.
17. Supplier corrective actions distinguish supplier-reported completion from assessor verification.
18. Local assessment storage is a field-continuity layer; later server persistence must synchronize these same supplier, assessment, action, and evidence identities rather than redesign them.

## Current vertical slice

The working slice includes:

- canonical organization, supplier, program, product, routing, resource, calendar, scenario, demand, recovery-action, comparison, explanation, action-log, planning-WIP, and footprint entities;
- `perUnit`, `perProgram`, and `perPeriod` requirement bases with program-date anchoring;
- runtime schema validation, semantic program validation, scenario lineage checks, and action governance;
- monthly or weekly periods with a large-weekly-model warning;
- date-based calendar capacity;
- product-specific lead-time phase allocation;
- sparse routing load and setup/batch support;
- direct-versus-indirect analysis and reporting;
- governing-constraint identification;
- source-aligned Northstar v2 fixture with four distinct routes, 144 monthly demand records across 2027–2029, and 2026 pre-ramp load;
- deterministic golden hashes plus business controls for annual utilization, peak periods, pre-ramp load, recovery, and explanation reconciliation;
- governed Northstar recovery fixture with dated labor, equipment, and temporary-capacity actions;
- baseline demand inheritance without copied or mutated demand records;
- baseline-versus-recovery comparison with load, capacity, gap, and utilization deltas;
- bounded CSV and Excel intake with worker-isolated workbook parsing, file/row/sheet/time limits, and spreadsheet-safe CSV export;
- reusable mappings and importers for calendars, resource groups, resources, products, programs, routing, and demand;
- CSV and browser-side Excel intake with worksheet selection, profiles, preview, reconciliation, and transactional apply;
- canonical inline editing for products, programs, calendars, resource groups, resources, routing, demand, footprint/WIP, and action records;
- guided and expert interface modes persisted in the browser;
- planning-level footprint, WIP, dwell, space-per-unit, available-area, and peak-factor analysis without inventory netting;
- supplier identity and dated local assessment library grouped by supplier;
- follow-up assessment creation with optional prior-model reuse and unverified-action carry-forward;
- corrective-action lifecycle from open through verified, including history, ownership, due dates, evidence, and ageing;
- local crash recovery, explicit assessment-file save/open, and portable evidence snapshots;
- HTTP endpoints for health, fixture retrieval, validation, imports, calculation, comparison, explanation, and reporting;
- named recovery actions with target, effective dates, owner, approval state, confidence, and audit-preserving rejection;
- explainable drill-through from a resource period to demand or program, product, routing revision, operation, standard, setup, and lead-time allocation;
- explicit explained-versus-calculated load reconciliation;
- downloadable standalone HTML executive report and portable JSON assessment;
- responsive desktop, tablet, and phone layout;
- PostgreSQL migrations for identity, tenancy, model entities, source lineage, imports, calculations, recovery actions, action snapshots, scenario comparisons, results, and audit;
- CI execution of every migration against a clean PostgreSQL 16 service;
- automated domain, engine, fixture, importer, API, reporting, explanation, HTTP integration, and web tests.

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
- `POST /v1/import/{entity}/preview` for calendars, resource groups, resources, products, programs, routing, and demand
- `POST /v1/import/{entity}/apply` with the preview payload and optional `acceptPartial: true`
- `POST /v1/calculate` with `{ "model": ..., "scenarioId": "..." }`
- `POST /v1/compare` with `{ "model": ..., "baselineScenarioId": "...", "comparisonScenarioId": "..." }`
- `POST /v1/explain` with `{ "model": ..., "scenarioId": "...", "resourceGroupId": "...", "periodStart": "YYYY-MM-DD" }`
- `POST /v1/report/decision` with the comparison payload and `format: "html" | "json"`

All import, calculation, comparison, explanation, and report input is runtime-validated before it changes a model or reaches the engine.

## Build gates

Before a branch is ready to merge:

- CI is green.
- All PostgreSQL migrations execute against a clean database.
- Northstar synthetic baseline and recovery cases are represented in the canonical schema.
- Golden calculations reproduce the intended lead-time, routing, program-basis, recovery, and explanation behavior.
- A shared project requirement remains one program load even when repeated across 100 routed member products.
- Missing and not-applicable inputs cannot silently become zero.
- Imports expose accepted/rejected rows and control totals.
- The API validates every import, calculation, comparison, explanation, and report request.
- The browser workflow reaches a baseline-versus-recovery decision without direct API use.
- Constraint detail reconciles to the selected calculated period.
- The decision can be exported as both an executive report and a portable assessment snapshot.
- No changes are made to the legacy `index.html`.

## Remaining R0 work

1. PostgreSQL repository implementation and synchronization for shared saved assessments and immutable runs.
2. Authentication, tenant enforcement, and deployment configuration.
3. Fleet-level supplier roll-up across users and teams.
4. Browser performance benchmark at the R0 market-entry scale and deferred single-pass engine restructuring only when measured scale requires it.
5. Report-first distinctive product branding after workflow and data contracts stabilize.
