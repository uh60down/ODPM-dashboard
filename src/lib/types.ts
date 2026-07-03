export type IssueType = 'Epic' | 'Story' | 'Bug' | 'Subtask';
export type ScopeDisposition = 'formalize' | 'absorb' | 'cut' | 'undecided';
export type HealthColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export interface Feature {
  feature_id: string;
  feature_name: string;
  category: string;
  product_concept_id: string | null;
}

export interface Milestone {
  milestone_id: string;
  name: string;
  due_date: string; // YYYY-MM-DD
  start_date: string | null; // default: previous milestone's due_date
  expected_curve: 'linear' | 's-curve'; // s-curve reserved for v2
}

export interface Issue {
  issue_key: string;
  issue_type: IssueType;
  /** NOT in spec §1.2 — native Jira field carried for display; see data/README.md open questions */
  summary: string;
  status: string; // workflow state, verbatim
  category: string;
  feature_id: string;
  epic_key: string | null; // ancestor epic; NULL for Epics
  parent_key: string | null; // direct parent; NULL for Epics
  milestone_id: string | null; // Stories/Bugs only
  is_scope_overflow_inherited: boolean;
  scope_disposition: ScopeDisposition | null; // amendment A1: Epic rows only
  created_at: string;
  updated_at: string;
}

export interface StatusTransition {
  issue_key: string;
  from_status: string | null; // NULL = creation
  to_status: string;
  changed_at: string;
}

export interface IssueMetrics {
  is_done: boolean;
  is_blocked: boolean;
  effective_stage: string;
  stage_entered_at: string | null;
  blocked_age_days: number | null;
}

export interface Progress {
  total: number;
  done: number;
  pct: number | null; // null when total = 0
  blocked: number;
  oldestBlockedDays: number | null;
  oldestBlockedKey: string | null;
}
