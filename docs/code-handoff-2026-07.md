# Code Handoff — Delivery Readiness Dashboard v1

Companion to: dashboard-requirements-spec-2026-07.md (the spec is normative;
this brief adds one amendment and the build constraints).

---

## Spec amendment A1 — scope_disposition

```sql
ALTER TABLE issues ADD COLUMN scope_disposition TEXT
  CHECK (scope_disposition IN ('formalize','absorb','cut','undecided'));
```

Grain rules (enforce in sync/validation, not just convention):
1. Meaningful on **Epic rows only**. Non-Epic rows: always NULL.
2. **Not inherited** — unlike is_scope_overflow_inherited. Disposition is a
   judgment about the epic as a unit; descendants never carry it.
3. Rule-coupled to the flag: Epic with is_scope_overflow_inherited = TRUE
   ⇒ scope_disposition NOT NULL (default 'undecided').
   Flag FALSE ⇒ disposition NULL.
4. P6 exposure table reads disposition from the Epic row; "undecided" rows
   sort to top (they are the ones awaiting a decision).

---

## Build target (v1)

- Static React + Vite frontend; no backend, no Jira API.
- Data input: JSON files in /data matching the ontology
  (features.json, milestones.json, issues.json, status_history.json).
- Derived metrics computed client-side per spec §1.3 view logic
  (is_done, is_blocked, effective_stage, stage_entered_at, blocked_age_days).
- Pages P1–P6 per spec §3. P7 out of scope for v1.
- Schedule-health coloring per spec §2.1 (linear curve only; past-due
  override; number = absolute pct, color = health — never conflate).
- Denominator: Stories + Bugs only (spec D2). Subtasks render only inside
  story drill-down rows.
- +scope: Epic-grain flag, inherited to descendants in the sample data
  exactly as a sync job would; disposition per amendment A1.
- Sample dataset: 4 categories (OTA, Digital Key, Remote Command, Remote
  Parking), 8–10 features, 15–20 epics (3–4 flagged +scope with mixed
  dispositions), 4 milestones with due dates spanning 2026-07 → 2027-01,
  ~150 stories/bugs with realistic state spread, status_history sufficient
  to back blocked ages and at least 6 weekly reconstruction points.

## Hard invariants (from spec §6 — write tests or assertions for these)

1. Removing all Subtasks from issues.json changes no displayed percentage.
2. Matrix cell color changes when only the mocked "today" advances; the
   number does not.
3. Toggling one epic's overflow flag changes exposure by exactly its
   Story+Bug count.
4. A feature at 99% shows delivered: no.
5. Sparklines render only if ≥ 4 weekly reconstruction points exist;
   otherwise the element is absent (never faked).

## Reliability rules for the session

- The spec is the source of truth; where this brief and the spec conflict,
  the spec wins except amendment A1.
- Do not invent metrics, pages, or fields beyond the spec. If something
  seems missing, surface it as a question in the README, don't fill the gap
  silently.
- Every percentage shown in the UI must be reproducible from the §0
  contract; include the contract block in the dashboard header verbatim.
- Keep the DATA shape documented in /data/README.md so the future Jira
  sync script (Route 3) has a fixed target.

## Suggested repo layout

```
delivery-dashboard/
  data/            features.json, milestones.json, issues.json,
                   status_history.json, README.md (shape contract)
  src/
    lib/metrics.ts        derived metrics + rollups (pure functions, tested)
    lib/health.ts         schedule-health calc (spec §2.1)
    pages/P1..P6
    components/           matrix, funnel, accordion, chips, blocked table
  docs/
    dashboard-requirements-spec-2026-07.md
    delivery-ontology-mobile-app-2026-07.md
    code-handoff-2026-07.md (this file)
```

*Dated July 2026.*
