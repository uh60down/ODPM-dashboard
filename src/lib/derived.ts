/**
 * Precomputed weekly reconstruction series shared by pages. All series come
 * from status_as_of over status_history — nothing here is stored state.
 */
import { dataset } from './data';
import { DONE_STATUS, countable, isBlockedStatus } from './metrics';
import {
  oldestBlockedAgeAt,
  snapshotCountable,
  sparklineSeries,
  weeklySampleDates,
  type AsOfSnapshot,
  type WeeklyPoint,
} from './timeline';

export const sampleDates = weeklySampleDates(dataset.historyByIssue, dataset.today);
export const snapshots = snapshotCountable(dataset.issues, dataset.historyByIssue, sampleDates);

const countableItems = countable(dataset.issues);
export const allCountableKeys = new Set(countableItems.map((i) => i.issue_key));
export const flaggedKeys = new Set(
  countableItems.filter((i) => i.is_scope_overflow_inherited).map((i) => i.issue_key),
);

export function keysWhere(pred: (i: (typeof countableItems)[number]) => boolean): Set<string> {
  return new Set(countableItems.filter(pred).map((i) => i.issue_key));
}

function counts(snap: AsOfSnapshot, keys?: Set<string>): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const [key, status] of snap.statuses) {
    if (keys && !keys.has(key)) continue;
    total++;
    if (status === DONE_STATUS) done++;
  }
  return { done, total };
}

/** progress-% sparkline over an optional key subset */
export function pctSeries(keys?: Set<string>): WeeklyPoint[] | null {
  return sparklineSeries(snapshots, (snap) => {
    const { done, total } = counts(snap, keys);
    return total === 0 ? null : (100 * done) / total;
  });
}

/** blocked-count sparkline */
export function blockedCountSeries(keys?: Set<string>): WeeklyPoint[] | null {
  return sparklineSeries(snapshots, (snap) => {
    let n = 0;
    for (const [key, status] of snap.statuses) {
      if (keys && !keys.has(key)) continue;
      if (isBlockedStatus(status)) n++;
    }
    return n;
  });
}

/** oldest-blocked-age sparkline (0 when nothing blocked) */
export function oldestBlockedSeries(): WeeklyPoint[] | null {
  return sparklineSeries(snapshots, (snap) => oldestBlockedAgeAt(snap, dataset.historyByIssue) ?? 0);
}

/** +scope exposure % sparkline */
export function exposureSeries(keys?: Set<string>): WeeklyPoint[] | null {
  return sparklineSeries(snapshots, (snap) => {
    let flagged = 0;
    let total = 0;
    for (const key of snap.statuses.keys()) {
      if (keys && !keys.has(key)) continue;
      total++;
      if (flaggedKeys.has(key)) flagged++;
    }
    return total === 0 ? null : (100 * flagged) / total;
  });
}

const keysByFeature = new Map<string, Set<string>>();
for (const i of countableItems) {
  if (!keysByFeature.has(i.feature_id)) keysByFeature.set(i.feature_id, new Set());
  keysByFeature.get(i.feature_id)!.add(i.issue_key);
}

/** delivered-feature-count sparkline (strict rule, reconstructed) */
export function deliveredFeaturesSeries(): WeeklyPoint[] | null {
  return sparklineSeries(snapshots, (snap) => {
    let delivered = 0;
    for (const keys of keysByFeature.values()) {
      let present = 0;
      let done = 0;
      for (const key of keys) {
        const s = snap.statuses.get(key);
        if (s == null) continue;
        present++;
        if (s === DONE_STATUS) done++;
      }
      if (present > 0 && present === done) delivered++;
    }
    return delivered;
  });
}
