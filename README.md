# Delivery Readiness Dashboard (v1)

Static React + Vite implementation of the **Delivery Readiness Dashboard**
per `docs/dashboard-requirements-spec-2026-07.md` (normative) and the code
handoff brief (`docs/code-handoff-2026-07.md`, incl. amendment A1).

```
Delivery Readiness Dashboard
Ontology:     Category → Feature → Epic → Story/Bug
Slice:        Milestone
Done:         QA Pass only
Denominator:  Stories + Bugs
```

Every number on every page is derivable from that contract (it is displayed
verbatim in the app header). No backend, no Jira API: data is committed JSON
in `/data`, the exact shape the future Route-3 sync script will emit
(see `data/README.md`).

## Quickstart

```bash
npm install
npm run dev            # local dev server
npm test               # invariant suite (spec §6)
npm run build          # typecheck + production build → dist/
npm run generate-data  # regenerate /data deterministically (SEED=n to vary)
```

“Today” is **mocked** at `2026-07-03T10:30Z` (`src/lib/config.ts`) so every
displayed number is reproducible from the committed JSON and the temporal
color invariant is testable.

## Layout

```
data/                  static JSON + shape contract (data/README.md)
scripts/generate-data.mjs   deterministic sample-data generator (validates grain rules)
src/lib/metrics.ts     derived metrics + rollups (pure, tested) — spec §1.3 views
src/lib/health.ts      schedule-health calc — spec §2.1
src/lib/timeline.ts    status_as_of reconstruction, weekly sampling
src/lib/derived.ts     precomputed weekly series (sparklines, trends)
src/pages/P1..P6       Program Overview · Milestone · Category/Epic ·
                       Feature Commitment · Blocked/Chase · +Scope Exposure
src/components/        matrix, funnel, accordion, chips, blocked tables, charts
docs/                  the spec + handoff brief this build implements
```

P7 (Reports / Settings) is out of scope for v1 per the handoff brief.
`expected_curve = 's-curve'` is reserved for v2 and not implemented.

## Hard invariants (spec §6) — all tested in `src/lib/invariants.test.ts`

1. Removing all Subtasks from `issues.json` changes **no** displayed percentage (D2).
2. Matrix cell **color** changes when only the mocked “today” advances; the
   **number** never does (D1).
3. Toggling one epic’s overflow flag changes exposure by exactly its
   Story+Bug count (D3 grain).
4. A feature at 99% shows `delivered: no` (strict rule).
5. Sparklines render only when ≥ 4 weekly reconstruction points exist;
   otherwise the element is absent — never faked.
6. Blocked ages match manual changelog inspection (synthetic + 5 sampled
   real issues).

Amendment A1 (`scope_disposition`) grain rules are also asserted over the
whole dataset, and re-checked at generation time.

## Interpretations & open questions (surfaced, not silently filled)

The spec left a few edges undefined. The choices made here are deliberate
and isolated — flag disagreements and they are one-line changes:

1. **`summary` field.** The §1.2 schema has no issue title, but the
   prototyped UI (blocked lists, accordion, +scope epic rows) displays
   names. `/data/issues.json` carries `summary` (a native Jira field) as a
   **display-only** addition. Question: adopt into the schema, or key-only UI?
2. **Milestones that have not started.** §2.1 clamps `elapsed_frac` at 0, so
   `expected_pct = 0` and `health_ratio = actual/1`: any progress at all
   renders **green**, and 0% renders **red** — before the milestone has
   begun (see M3/M4 columns). Spec-literal, but consider a “not started”
   gray in v2.
3. **Matrix row/grand totals** span milestones, so no single due date exists:
   they render **without** a health color (numbers only). Column totals are
   per-milestone and are colored.
4. **Stalled list (P5).** “Not blocked but stage_entered_at > 14 days ago”,
   read literally, includes finished work and untouched backlog. Done items
   are excluded (finished ≠ stalled); untouched `new` items are kept (aged
   backlog seems to be the point). Confirm both.
5. **Feature with zero countable items** reports `delivered: no` — the
   vacuous-truth “yes” would overstate readiness.
6. **P4 internal delta** (“internal scope runs N% above committed”) is
   rendered with an `internal` badge; v1 has no auth, so the badge stands in
   for the internal-only visibility rule.
7. **Funnel universe** is Stories+Bugs (D2 denominator), not all issue types,
   so its 100% equals the program denominator.

## Reproducing any number by hand

Pick any cell: filter `issues.json` to `issue_type ∈ {Story, Bug}`, the
cell’s `milestone_id` and `category`; `pct = round(100 · #(status = 'qa pass') / #items)`.
Cell color: `expected = 100 · clamp((today − start_date)/(due_date − start_date), 0, 1)`
on the milestone’s dates, `ratio = pct / max(expected, 1)`, banded per §2.1
(past-due & <100% → red; no items → gray).
