# /data — shape contract

These four JSON files are the dashboard’s only input, and the fixed target
for the future Jira sync script (Route 3: script → static JSON → dashboard).
The shapes mirror the SQL schema in spec §1 plus amendment A1. The sample
content is generated deterministically by `scripts/generate-data.mjs`
(`npm run generate-data`; `SEED=n` for a different but valid dataset) and is
validated against every grain rule below at generation time.

## features.json — dimension

| field | type | notes |
|---|---|---|
| feature_id | string | PK, e.g. `F-DK-001` |
| feature_name | string | unique, 1:1 with feature_id |
| category | string | 4 categories in sample data |
| product_concept_id | string \| null | reserved (v1: always null) |

## milestones.json — dimension

| field | type | notes |
|---|---|---|
| milestone_id | string | PK, `M1`..`M4` |
| name | string | display name |
| due_date | `YYYY-MM-DD` | required |
| start_date | `YYYY-MM-DD` \| null | null ⇒ previous milestone’s due_date (spec §1.1) |
| expected_curve | `'linear'` | `'s-curve'` reserved for v2 |

## issues.json — fact

| field | type | notes |
|---|---|---|
| issue_key | string | PK |
| issue_type | `Epic \| Story \| Bug \| Subtask` | |
| summary | string | **not in spec §1.2** — display-only addition, see README open question 1 |
| status | string | workflow state, verbatim (see below) |
| category | string | denormalized from features |
| feature_id | string | FK → features |
| epic_key | string \| null | ancestor epic; NULL for Epics |
| parent_key | string \| null | direct parent; NULL for Epics |
| milestone_id | string \| null | Stories/Bugs only; NULL for Epics & Subtasks |
| is_scope_overflow_inherited | boolean | set on Epics by judgment, **copied to all descendants by sync** |
| scope_disposition | `formalize \| absorb \| cut \| undecided \| null` | amendment A1 — see grain rules |
| created_at | ISO 8601 UTC | |
| updated_at | ISO 8601 UTC | = last transition time |

**Hierarchy convention (spec §1.2, mandatory):** `parent_key` = direct parent
(Story→Epic, Subtask→Story, Bug→Epic). `epic_key` = ancestor epic; equals
`parent_key` for Stories/Bugs, differs for Subtasks, NULL for Epics.

**Workflow states (verbatim):** `new`, `dev ready`, `in dev`, `dev blocked`,
`in review`, `qa ready`, `qa active`, `qa blocked`, `qa pass`.

**Amendment A1 grain rules (validated):**
1. `scope_disposition` is meaningful on Epic rows only; non-Epic rows: always null.
2. Not inherited (unlike the flag) — descendants never carry it.
3. Epic flag TRUE ⇒ disposition NOT NULL (default `undecided`); flag FALSE ⇒ null.
4. P6 reads disposition from the Epic row; `undecided` sorts to top.

## status_history.json — fact

| field | type | notes |
|---|---|---|
| issue_key | string | FK → issues |
| from_status | string \| null | null = creation event |
| to_status | string | |
| changed_at | ISO 8601 UTC | PK is (issue_key, changed_at) |

Guarantees the sync script must uphold (all validated in the generator and
relied on by the app):
- every issue has ≥ 1 row; the first row has `from_status = null`;
- rows per issue are strictly increasing in `changed_at`;
- the last row’s `to_status` equals the issue’s current `status`;
- **full changelog backfill** on first sync — temporal reconstruction
  (sparklines, burn line, exposure trend) depends on complete history.

Sample data spans 2026-04 → 2026-07-03 (mocked today), giving 12 weekly
reconstruction points (≥ 6 required by the handoff, ≥ 4 required before any
sparkline renders).
