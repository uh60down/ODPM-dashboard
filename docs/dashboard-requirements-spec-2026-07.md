# Delivery Readiness Dashboard — Requirements Specification

## Status

**Artifact type:** Build specification
**Snapshot date:** July 2026
**Depends on:** Applied Delivery Ontology (delivery-ontology-mobile-app-2026-07)
**Supersedes:** dashboard mockup review + prototype series (build-progress-*.html)

---

## 0. The contract (displayed in the dashboard header)

```
Delivery Readiness Dashboard
Ontology:     Category → Feature → Epic → Story/Bug
Slice:        Milestone
Done:         QA Pass only
Denominator:  Stories + Bugs
```

Every metric on every page must be derivable from this contract. Any widget
that cannot state its numbers in these terms does not ship.

**Locked decisions:**

- **D1 — Color ≠ progress.** Cell numbers show absolute % QA pass. Cell
  colors show schedule health relative to the milestone due date.
- **D2 — One denominator.** Program/feature/epic progress counts Stories +
  Bugs only. Subtasks appear only inside story drill-downs.
- **D3 — Overflow model.** `+scope` is an Epic-level flag, inherited by
  descendants. No "Other/Platform" category unless work is genuinely
  featureless infrastructure. Overflow stays attached to the feature whose
  expectation it expands.

---

## 1. Data model

### 1.1 Dimension tables

```sql
CREATE TABLE features (
  feature_id          TEXT PRIMARY KEY,
  feature_name        TEXT NOT NULL UNIQUE,     -- 1:1 with feature_id
  category            TEXT NOT NULL,
  product_concept_id  TEXT NULL                 -- future bridge to product ontology
);

CREATE TABLE milestones (
  milestone_id        TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  due_date            DATE NOT NULL,
  start_date          DATE NULL,                -- default: previous milestone's due_date
  expected_curve      TEXT NOT NULL DEFAULT 'linear'  -- 'linear' | 's-curve'; start linear
);
```

### 1.2 Fact tables

```sql
CREATE TABLE issues (
  issue_key                   TEXT PRIMARY KEY,
  issue_type                  TEXT NOT NULL,    -- Epic | Story | Bug | Subtask
  status                      TEXT NOT NULL,    -- workflow state, verbatim
  category                    TEXT NOT NULL,    -- denormalized from features
  feature_id                  TEXT NOT NULL REFERENCES features,
  epic_key                    TEXT NULL,        -- denormalized ancestor; NULL for Epics
  parent_key                  TEXT NULL,        -- direct parent; NULL for Epics
  milestone_id                TEXT NULL REFERENCES milestones,  -- Stories/Bugs only
  is_scope_overflow_inherited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMP NOT NULL,
  updated_at                  TIMESTAMP NOT NULL
);

CREATE TABLE status_history (
  issue_key    TEXT NOT NULL REFERENCES issues,
  from_status  TEXT NULL,                       -- NULL = creation
  to_status    TEXT NOT NULL,
  changed_at   TIMESTAMP NOT NULL,
  PRIMARY KEY (issue_key, changed_at)
);
```

**Hierarchy convention (schema comment, mandatory):**
`parent_key` = direct parent (Story→Epic, Subtask→Story, Bug→Epic).
`epic_key` = ancestor epic for cheap grouping; equals `parent_key` for
Stories and Bugs, differs for Subtasks, NULL for Epics.
`is_scope_overflow_inherited` is set on Epic rows by human judgment and
copied to all descendants at sync time — never set independently below Epic.

### 1.3 Views

```sql
-- Item universe for all progress math (D2)
CREATE VIEW countable_items AS
SELECT * FROM issues WHERE issue_type IN ('Story','Bug');

-- Current per-issue metrics (computed, never stored)
CREATE VIEW current_issue_metrics AS
SELECT
  i.issue_key,
  i.status = 'qa pass'                                   AS is_done,
  i.status IN ('dev blocked','qa blocked')               AS is_blocked,
  CASE i.status
    WHEN 'dev blocked' THEN 'in dev'
    WHEN 'qa blocked'  THEN 'qa active'
    ELSE i.status END                                    AS effective_stage,
  (SELECT MAX(changed_at) FROM status_history h
    WHERE h.issue_key = i.issue_key)                     AS stage_entered_at,
  CASE WHEN i.status IN ('dev blocked','qa blocked')
    THEN CAST(julianday('now') - julianday(
      (SELECT MAX(changed_at) FROM status_history h
        WHERE h.issue_key = i.issue_key
          AND h.to_status = i.status)) AS INTEGER)
    ELSE NULL END                                        AS blocked_age_days
FROM issues i;

-- Rollup: progress by any grouping (example: feature × milestone)
CREATE VIEW feature_milestone_progress AS
SELECT
  c.feature_id, c.category, c.milestone_id,
  COUNT(*)                                    AS total_items,
  SUM(m.is_done)                              AS done_items,
  ROUND(100.0 * SUM(m.is_done) / COUNT(*))    AS pct,
  SUM(m.is_blocked)                           AS blocked_items,
  MAX(m.blocked_age_days)                     AS oldest_blocked_days
FROM countable_items c
JOIN current_issue_metrics m USING (issue_key)
GROUP BY c.feature_id, c.category, c.milestone_id;

-- Point-in-time reconstruction (sparklines, compare-with-snapshot, CFD)
-- status of issue at time T = last transition at or before T
CREATE VIEW status_as_of AS               -- parameterized in app code by :t
SELECT h.issue_key, h.to_status AS status_at_t
FROM status_history h
JOIN (SELECT issue_key, MAX(changed_at) AS mx
      FROM status_history WHERE changed_at <= :t
      GROUP BY issue_key) latest
  ON latest.issue_key = h.issue_key AND latest.mx = h.changed_at;
```

---

## 2. Metric definitions (normative)

| Metric | Definition |
|---|---|
| **Progress (any node)** | done Stories+Bugs ÷ total Stories+Bugs beneath the node, within the active milestone slice |
| **Milestone readiness** | Progress over items where `milestone_id = M` |
| **Feature delivered** | TRUE iff every Story+Bug under every epic of the feature is `qa pass` (scoped to slice when a slice is active) |
| **Blocked age** | days since last transition into the current blocked status |
| **Oldest blocked** | max blocked age in scope |
| **+Scope exposure** | Stories+Bugs with `is_scope_overflow_inherited` ÷ all Stories+Bugs (per scope) |
| **Schedule health (color)** | actual progress ÷ expected progress at today's date (see 2.1) |

### 2.1 Schedule health (D1)

For milestone M with `start_date`, `due_date`, linear curve:

```
elapsed_frac  = clamp((today − start_date) / (due_date − start_date), 0, 1)
expected_pct  = 100 × elapsed_frac                  -- linear v1
health_ratio  = actual_pct / max(expected_pct, 1)
```

| health_ratio | Color | Meaning |
|---|---|---|
| ≥ 1.00 | green | at or ahead of burn |
| 0.75 – 0.99 | yellow | behind, recoverable |
| 0.50 – 0.74 | orange | at risk |
| < 0.50 | red | off track |
| no items | gray | — |
| past due & < 100% | red (override) | missed |

The cell **number** is always `actual_pct`. Color carries only health.
`expected_curve = 's-curve'` is reserved for v2; do not implement in v1.

---

## 3. Pages and widgets

### P1 — Program Overview (landing)

| Widget | Content | Source |
|---|---|---|
| KPI: Program progress | pct, done/total (Stories+Bugs, all milestones) | feature_milestone_progress summed |
| KPI: <current milestone> readiness | pct over current milestone slice | same, filtered |
| KPI: Features delivered | count fully-passed / total features | feature-delivered rule |
| KPI: Blocked now | count, split dev/qa | current_issue_metrics |
| KPI: Oldest blocked | days + issue_key | current_issue_metrics |
| KPI: +Scope exposure | pct + item count | overflow metric |
| Category × Milestone matrix | number = actual pct; color = schedule health; row/col totals | rollup view + health calc |
| Lifecycle funnel | count per effective_stage; blocked shown as thin interruptions between stages, red | current_issue_metrics |
| Blocked top-5 | key, type, epic, status, age; sorted age desc | current_issue_metrics |
| +Scope summary | exposure pct + top offending epics | overflow metric grouped by epic |

KPI sparklines: render only when ≥ 4 weekly points exist in status_history
reconstruction; otherwise omit the sparkline element entirely (no fakes).

### P2 — Milestone View

Milestone selector (chips or dropdown, default = nearest future due_date).
All widgets from P1 recomputed within the slice, plus:
- **Burn line:** actual done-count over time (from status_as_of, weekly
  samples) vs expected line to due_date.
- **Remaining by category:** open items per category for this milestone.

### P3 — Category / Epic View (drilldown)

Three-level accordion exactly as prototyped: Category header (rollup pct)
→ Feature rows (epic count, distribution bar, blocked badge, pct)
→ Epic rows (+scope tag, bar, pct) → item rows (type chip, milestone tag,
subtask done/total for stories, state chip). Out-of-slice items dimmed,
not hidden, when a milestone slice is active.

### P4 — Feature Commitment (stakeholder view)

Features only — no epics, no +scope internals. Columns: feature, category,
delivered (yes/no per the strict rule), pct, milestone spread. This page is
exportable; it is the external-facing number (agreement view). A one-line
delta vs the internal number ("internal scope runs N% above committed") is
shown to internal users only.

### P5 — Blocked / Chase

Full blocked list: path (Category › FID › Epic), item, milestone, phase
(dev/qa), age desc, age ≥ 7d highlighted. Secondary list: *stalled* items —
not blocked but stage_entered_at > 14 days ago.

### P6 — +Scope Exposure

Exposure trend (weekly, reconstructed), epics flagged +scope with item
counts and progress, grouped by feature — each row answers: which
commitment does this overflow inflate? Disposition column (formalize /
absorb / cut / undecided) — a human-maintained field; default 'undecided'.

### P7 — Reports / Settings

Report: snapshot export (P1 + P4 as of a date). Settings: milestone dates,
curve type, health thresholds.

---

## 4. Jira mapping and sync

| Model element | Jira source |
|---|---|
| issue_key, issue_type, status | native fields |
| category | project or component (choose once; record choice here) |
| feature_id / feature_name | custom field on Epic (or Advanced Roadmaps level) |
| epic_key | Epic Link / parent (company-managed vs team-managed differ — normalize in sync) |
| parent_key | parent field |
| milestone_id | fixVersion |
| is_scope_overflow_inherited | Epic label `scope-overflow` → propagated to descendants by sync job |
| status_history | issue changelog (`expand=changelog`), status items only |
| milestones.due_date | fixVersion release date |

**Sync rules:**
1. Full backfill of changelog on first sync — temporal features depend on
   complete history; this is non-negotiable and cheap to do once.
2. Incremental sync by `updated >= last_sync`; re-pull changelog for
   updated issues only.
3. Overflow propagation runs after each sync: descendants inherit the
   epic's flag; direct flags below Epic level are ignored and logged.
4. Denormalized fields (category, feature_name on issues) refresh from
   dimension tables each sync; dimension tables are the source of truth.
5. Sync job emits one JSON per page-load need; hosting per Route 3
   (script → static JSON → dashboard; GitHub Actions + Pages acceptable).

---

## 5. Non-goals (v1)

- S-curve expected progress (linear only)
- Product-ontology projection (`product_concept_id` stays nullable/unused)
- Per-user views, auth, write-back to Jira
- Subtask-weighted progress

---

## 6. Acceptance criteria

1. Every displayed percentage reproducible by hand from the contract in §0.
2. Matrix cell color changes when only the calendar advances (health is
   temporal); the number never does.
3. Removing all Subtasks from the dataset changes no progress number (D2).
4. Flagging one epic +scope changes exposure by exactly its Story+Bug
   count (D3 grain).
5. A feature at 99% shows "delivered: no" (strict rule).
6. Blocked ages match manual changelog inspection for 5 sampled issues.

---

*Dated July 2026. The spec encodes the applied delivery ontology at Level 3
(analytics). Representation followed the consumer.*
