/**
 * Point-in-time reconstruction (spec §1.3 status_as_of): status of an issue
 * at time T = last transition at or before T. An issue with no transition
 * ≤ T did not exist yet and is excluded from as-of universes.
 */
import type { Issue, StatusTransition } from './types';
import { DONE_STATUS, isBlockedStatus, isCountable, type HistoryIndex } from './metrics';

const DAY = 86400000;

export function statusAsOf(rows: StatusTransition[], t: Date): string | null {
  let status: string | null = null;
  const ms = t.getTime();
  for (const r of rows) {
    if (Date.parse(r.changed_at) > ms) break;
    status = r.to_status;
  }
  return status;
}

/**
 * Weekly sample dates ending at `today`, going back while data exists,
 * capped at `max` points. Used by sparklines, burn lines, and the exposure
 * trend. Sparklines render only when ≥ 4 points exist (spec P1).
 */
export function weeklySampleDates(historyByIssue: HistoryIndex, today: Date, max = 12): Date[] {
  let earliest = Infinity;
  for (const rows of historyByIssue.values()) {
    if (rows.length) earliest = Math.min(earliest, Date.parse(rows[0].changed_at));
  }
  if (!isFinite(earliest)) return [];
  const dates: Date[] = [];
  for (let t = today.getTime(); t >= earliest && dates.length < max; t -= 7 * DAY) {
    dates.push(new Date(t));
  }
  return dates.reverse();
}

export const MIN_SPARKLINE_POINTS = 4;

export interface AsOfSnapshot {
  date: Date;
  /** countable items existing at date, with their as-of status */
  statuses: Map<string, string>; // issue_key -> status_at_t
}

/** Snapshot the countable universe at each sample date. */
export function snapshotCountable(
  issues: Issue[],
  historyByIssue: HistoryIndex,
  dates: Date[],
): AsOfSnapshot[] {
  const items = issues.filter(isCountable);
  return dates.map((date) => {
    const statuses = new Map<string, string>();
    for (const i of items) {
      const rows = historyByIssue.get(i.issue_key) ?? [];
      const s = statusAsOf(rows, date);
      if (s != null) statuses.set(i.issue_key, s);
    }
    return { date, statuses };
  });
}

export interface WeeklyPoint {
  date: Date;
  value: number;
}

/**
 * Sparkline series for a metric over snapshots. Returns null when fewer than
 * MIN_SPARKLINE_POINTS points exist — the caller must then omit the sparkline
 * element entirely (never fake it).
 */
export function sparklineSeries(
  snapshots: AsOfSnapshot[],
  value: (snap: AsOfSnapshot) => number | null,
): WeeklyPoint[] | null {
  const pts: WeeklyPoint[] = [];
  for (const s of snapshots) {
    const v = value(s);
    if (v != null) pts.push({ date: s.date, value: v });
  }
  return pts.length >= MIN_SPARKLINE_POINTS ? pts : null;
}

/** done-count at a snapshot over an item subset (by key). */
export function doneCountAt(snap: AsOfSnapshot, keys?: Set<string>): number {
  let n = 0;
  for (const [key, status] of snap.statuses) {
    if (keys && !keys.has(key)) continue;
    if (status === DONE_STATUS) n++;
  }
  return n;
}

/** universe size at a snapshot over an item subset. */
export function totalCountAt(snap: AsOfSnapshot, keys?: Set<string>): number {
  if (!keys) return snap.statuses.size;
  let n = 0;
  for (const key of snap.statuses.keys()) if (keys.has(key)) n++;
  return n;
}

/** blocked issue keys at a snapshot. */
export function blockedAt(snap: AsOfSnapshot): string[] {
  const out: string[] = [];
  for (const [key, status] of snap.statuses) if (isBlockedStatus(status)) out.push(key);
  return out;
}

/** oldest blocked age (days) at time t, or null if nothing blocked. */
export function oldestBlockedAgeAt(
  snap: AsOfSnapshot,
  historyByIssue: HistoryIndex,
): number | null {
  let oldest: number | null = null;
  for (const key of blockedAt(snap)) {
    const rows = historyByIssue.get(key) ?? [];
    const status = snap.statuses.get(key)!;
    for (let k = rows.length - 1; k >= 0; k--) {
      const at = Date.parse(rows[k].changed_at);
      if (at <= snap.date.getTime() && rows[k].to_status === status) {
        const age = Math.floor((snap.date.getTime() - at) / DAY);
        if (oldest == null || age > oldest) oldest = age;
        break;
      }
    }
  }
  return oldest;
}
