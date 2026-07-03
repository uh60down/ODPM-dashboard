/**
 * Derived per-issue metrics and rollups — the client-side equivalent of the
 * spec §1.3 views (current_issue_metrics, countable_items,
 * feature_milestone_progress). Pure functions; "now" is always a parameter.
 */
import type { Issue, IssueMetrics, Progress, StatusTransition } from './types';

export const DONE_STATUS = 'qa pass';
export const BLOCKED_STATUSES = ['dev blocked', 'qa blocked'] as const;
export const STAGE_ORDER = ['new', 'dev ready', 'in dev', 'in review', 'qa ready', 'qa active', 'qa pass'];

const DAY = 86400000;

export function isCountable(i: Issue): boolean {
  return i.issue_type === 'Story' || i.issue_type === 'Bug';
}

export function isBlockedStatus(status: string): boolean {
  return (BLOCKED_STATUSES as readonly string[]).includes(status);
}

export function effectiveStage(status: string): string {
  if (status === 'dev blocked') return 'in dev';
  if (status === 'qa blocked') return 'qa active';
  return status;
}

export type HistoryIndex = Map<string, StatusTransition[]>;

/** Group transitions by issue, sorted by changed_at ascending. */
export function indexHistory(history: StatusTransition[]): HistoryIndex {
  const byIssue: HistoryIndex = new Map();
  for (const h of history) {
    const rows = byIssue.get(h.issue_key);
    if (rows) rows.push(h);
    else byIssue.set(h.issue_key, [h]);
  }
  for (const rows of byIssue.values()) {
    rows.sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  }
  return byIssue;
}

/** current_issue_metrics for every issue (spec §1.3). */
export function computeIssueMetrics(
  issues: Issue[],
  historyByIssue: HistoryIndex,
  today: Date,
): Map<string, IssueMetrics> {
  const out = new Map<string, IssueMetrics>();
  for (const i of issues) {
    const rows = historyByIssue.get(i.issue_key) ?? [];
    const last = rows.length ? rows[rows.length - 1] : null;
    const blocked = isBlockedStatus(i.status);
    let blockedAge: number | null = null;
    if (blocked) {
      // last transition INTO the current blocked status
      for (let k = rows.length - 1; k >= 0; k--) {
        if (rows[k].to_status === i.status) {
          blockedAge = Math.floor((today.getTime() - Date.parse(rows[k].changed_at)) / DAY);
          break;
        }
      }
    }
    out.set(i.issue_key, {
      is_done: i.status === DONE_STATUS,
      is_blocked: blocked,
      effective_stage: effectiveStage(i.status),
      stage_entered_at: last ? last.changed_at : null,
      blocked_age_days: blockedAge,
    });
  }
  return out;
}

/**
 * Item universe for all progress math (D2): Stories + Bugs only, optionally
 * restricted to a milestone slice.
 */
export function countable(issues: Issue[], sliceId?: string | null): Issue[] {
  return issues.filter(
    (i) => isCountable(i) && (sliceId == null || i.milestone_id === sliceId),
  );
}

/** Progress rollup over an already-filtered set of countable items. */
export function progressOf(items: Issue[], metrics: Map<string, IssueMetrics>): Progress {
  let done = 0;
  let blocked = 0;
  let oldestBlockedDays: number | null = null;
  let oldestBlockedKey: string | null = null;
  for (const i of items) {
    const m = metrics.get(i.issue_key);
    if (!m) continue;
    if (m.is_done) done++;
    if (m.is_blocked) {
      blocked++;
      if (m.blocked_age_days != null && (oldestBlockedDays == null || m.blocked_age_days > oldestBlockedDays)) {
        oldestBlockedDays = m.blocked_age_days;
        oldestBlockedKey = i.issue_key;
      }
    }
  }
  const total = items.length;
  return {
    total,
    done,
    pct: total === 0 ? null : Math.round((100 * done) / total),
    blocked,
    oldestBlockedDays,
    oldestBlockedKey,
  };
}

/**
 * Feature delivered (strict rule): TRUE iff every Story+Bug under every epic
 * of the feature is 'qa pass', scoped to the slice when one is active.
 * A feature with zero countable items in scope is reported NOT delivered
 * (vacuous truth would overstate readiness — see README open questions).
 */
export function featureDelivered(
  featureId: string,
  issues: Issue[],
  sliceId?: string | null,
): boolean {
  const items = countable(issues, sliceId).filter((i) => i.feature_id === featureId);
  return items.length > 0 && items.every((i) => i.status === DONE_STATUS);
}

/** +Scope exposure: flagged countable ÷ all countable, within the given items. */
export function scopeExposure(items: Issue[]): { flagged: number; total: number; pct: number | null } {
  const flagged = items.filter((i) => i.is_scope_overflow_inherited).length;
  return {
    flagged,
    total: items.length,
    pct: items.length === 0 ? null : Math.round((100 * flagged) / items.length),
  };
}
