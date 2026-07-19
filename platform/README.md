# Capacity Assurance Platform

This directory contains the market-scale successor to the legacy single-file Capacity & Engineering Workbook.

The root `index.html` remains the reference implementation for proven domain behavior. It is not the architectural foundation of this platform.

## Product boundary

The platform answers:

> Can this plant or supplier meet committed demand, what constraint fails first, and what recovery action closes the gap credibly?

It is not an ERP, MRP, MES, finite scheduler, dispatching system, or accounting product.

## Architecture

- `packages/domain` — vendor-neutral canonical manufacturing-capacity model and runtime validation.
- `packages/engine` — deterministic, headless capacity and lead-time calculation engine.
- `apps/api` — planned HTTP/API and job orchestration surface.
- `apps/web` — planned browser application.
- PostgreSQL persistence and import/mapping packages will be added after the calculation slice is green.

## Modeling principles

1. Sparse routing assignments replace product-by-department matrices.
2. `notApplicable`, `missing`, `zero`, and numeric `value` are distinct states.
3. Products may have multiple effective-dated routing revisions.
4. Product operations map to product-specific lead-time phases.
5. Resources use working calendars with date exceptions, not annual capacity divided by twelve.
6. Labor, equipment, skills, tooling, space, external services, and other constraints share a common resource abstraction.
7. Source-system identifiers are aliases; no ERP vendor owns the core model.
8. The calculation engine is independent of UI, persistence, and integrations.

## Current vertical slice

The first slice includes:

- canonical organization, product, routing, resource, calendar, scenario, and demand entities;
- runtime schema validation;
- monthly or weekly periods;
- date-based calendar capacity;
- product-specific lead-time phase allocation;
- sparse routing load;
- setup/batch load support;
- governing-constraint identification;
- tests for pre-shipment work, bypassed resources, holidays, and governing constraints.

## Commands

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

## Build gates

Before this branch is ready to merge:

- CI is green.
- Northstar synthetic case is represented in the canonical schema.
- Golden calculations reproduce the intended lead-time and routing behavior.
- Missing and not-applicable inputs cannot silently become zero.
- No changes are made to the legacy `index.html`.

## Next vertical slices

1. Full Northstar fixture and golden-result assertions.
2. PostgreSQL schema and migrations.
3. Excel/CSV import with reusable mapping profiles.
4. Calculation API and asynchronous jobs.
5. First web workflow: import → validate → calculate → inspect constraint.
