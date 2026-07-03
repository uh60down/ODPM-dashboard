/**
 * Hard invariants from spec §6 / handoff brief, run against the real
 * committed dataset plus synthetic fixtures where the spec demands an exact
 * scenario.
 */
import { describe, expect, it } from 'vitest';
import featuresJson from '../../data/features.json';
import milestonesJson from '../../data/milestones.json';
import issuesJson from '../../data/issues.json';
import historyJson from '../../data/status_history.json';
import type { Feature, Issue, Milestone, StatusTransition } from './types';
import { buildDataset } from './data';
import {
  computeIssueMetrics,
  countable,
  featureDelivered,
  indexHistory,
  progressOf,
  scopeExposure,
} from './metrics';
import { expectedPct, healthColor, healthRatio } from './health';
import {
  MIN_SPARKLINE_POINTS,
  snapshotCountable,
  sparklineSeries,
  weeklySampleDates,
} from './timeline';

const TODAY = new Date('2026-07-03T10:30:00Z');
const features = featuresJson as Feature[];
const milestones = milestonesJson as Milestone[];
const issues = issuesJson as Issue[];
const history = historyJson as StatusTransition[];
const ds = buildDataset(features, milestones, issues, history, TODAY);

function allDisplayedPcts(iss: Issue[]): (number | null)[] {
  const hist = indexHistory(history);
  const metrics = computeIssueMetrics(iss, hist, TODAY);
  const pcts: (number | null)[] = [];
  // program + per milestone
  pcts.push(progressOf(countable(iss), metrics).pct);
  for (const m of milestones) pcts.push(progressOf(countable(iss, m.milestone_id), metrics).pct);
  // category × milestone matrix
  for (const cat of ds.categories) {
    for (const m of milestones) {
      pcts.push(progressOf(countable(iss, m.milestone_id).filter((i) => i.category === cat), metrics).pct);
    }
    pcts.push(progressOf(countable(iss).filter((i) => i.category === cat), metrics).pct);
  }
  // per feature and per epic
  for (const f of features) {
    pcts.push(progressOf(countable(iss).filter((i) => i.feature_id === f.feature_id), metrics).pct);
  }
  for (const e of iss.filter((i) => i.issue_type === 'Epic')) {
    pcts.push(progressOf(countable(iss).filter((i) => i.epic_key === e.issue_key), metrics).pct);
  }
  return pcts;
}

describe('invariant 1 — subtasks never move a percentage (D2)', () => {
  it('removing all Subtasks changes no displayed percentage', () => {
    const noSubtasks = issues.filter((i) => i.issue_type !== 'Subtask');
    expect(noSubtasks.length).toBeLessThan(issues.length); // dataset really has subtasks
    expect(allDisplayedPcts(noSubtasks)).toEqual(allDisplayedPcts(issues));
  });
});

describe('invariant 2 — color is temporal, the number is not (D1)', () => {
  const m1 = milestones.find((m) => m.milestone_id === 'M1')!;

  it('advancing the mocked today changes the color band', () => {
    // M1: start 2026-05-04, due 2026-07-31. Hold actual at 68%.
    const actual = 68;
    const early = healthColor(actual, 60, m1, new Date('2026-06-28T00:00:00Z'), milestones);
    const mid = healthColor(actual, 60, m1, new Date('2026-07-20T00:00:00Z'), milestones);
    const late = healthColor(actual, 60, m1, new Date('2026-07-28T00:00:00Z'), milestones);
    const pastDue = healthColor(actual, 60, m1, new Date('2026-08-05T00:00:00Z'), milestones);
    expect(early).toBe('green'); // expected ≈ 62.5% → ratio ≈ 1.09
    expect(mid).toBe('yellow'); // expected ≈ 87.5% → ratio ≈ 0.78
    expect(late).toBe('orange'); // expected ≈ 96.6% → ratio ≈ 0.70
    expect(pastDue).toBe('red'); // past-due override
    expect(early).not.toBe(late);
  });

  it('the number (actual pct) is independent of today', () => {
    const items = countable(issues, 'M1');
    const pctA = progressOf(items, computeIssueMetrics(issues, ds.historyByIssue, new Date('2026-07-03T00:00:00Z'))).pct;
    const pctB = progressOf(items, computeIssueMetrics(issues, ds.historyByIssue, new Date('2026-07-28T00:00:00Z'))).pct;
    expect(pctA).toBe(pctB);
  });

  it('ratio bands follow spec §2.1', () => {
    expect(healthRatio(100, 100)).toBe(1);
    expect(healthColor(80, 10, m1, new Date('2026-06-01T00:00:00Z'), milestones)).toBe('green');
    expect(healthColor(0, 0, m1, TODAY, milestones)).toBe('gray'); // no items
    expect(healthColor(100, 10, m1, new Date('2026-09-01T00:00:00Z'), milestones)).toBe('green'); // done & past due: no override
  });
});

describe('invariant 3 — overflow flag grain (D3)', () => {
  it('toggling one epic changes exposure by exactly its Story+Bug count', () => {
    const epic = issues.find((i) => i.issue_type === 'Epic' && !i.is_scope_overflow_inherited)!;
    const before = scopeExposure(countable(issues));
    // flip the epic and its descendants, exactly as the sync job would
    const toggled = issues.map((i) =>
      i.issue_key === epic.issue_key || i.epic_key === epic.issue_key
        ? { ...i, is_scope_overflow_inherited: true }
        : i,
    );
    const after = scopeExposure(countable(toggled));
    const epicItems = countable(issues).filter((i) => i.epic_key === epic.issue_key);
    expect(epicItems.length).toBeGreaterThan(0);
    expect(after.flagged - before.flagged).toBe(epicItems.length);
    expect(after.total).toBe(before.total);
  });
});

describe('invariant 4 — delivered is strict', () => {
  it('a feature at 99% shows delivered: no', () => {
    const synthetic: Issue[] = Array.from({ length: 100 }, (_, k) => ({
      issue_key: `SYN-${k}`,
      issue_type: 'Story',
      summary: `Synthetic ${k}`,
      status: k === 0 ? 'qa active' : 'qa pass', // 99/100 done
      category: 'Syn',
      feature_id: 'F-SYN',
      epic_key: 'SYN-EPIC',
      parent_key: 'SYN-EPIC',
      milestone_id: 'M1',
      is_scope_overflow_inherited: false,
      scope_disposition: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }));
    expect(progressOf(synthetic, computeIssueMetrics(synthetic, new Map(), TODAY)).pct).toBe(99);
    expect(featureDelivered('F-SYN', synthetic)).toBe(false);
    const allDone = synthetic.map((i) => ({ ...i, status: 'qa pass' }));
    expect(featureDelivered('F-SYN', allDone)).toBe(true);
  });
});

describe('invariant 5 — sparklines are never faked', () => {
  it('series is null below the 4-point threshold', () => {
    const dates = weeklySampleDates(ds.historyByIssue, TODAY);
    expect(dates.length).toBeGreaterThanOrEqual(6); // handoff: ≥6 weekly points in sample data
    const snaps = snapshotCountable(issues, ds.historyByIssue, dates);
    expect(sparklineSeries(snaps, (s) => s.statuses.size)).not.toBeNull();
    const few = snaps.slice(-(MIN_SPARKLINE_POINTS - 1));
    expect(sparklineSeries(few, (s) => s.statuses.size)).toBeNull();
  });
});

describe('blocked age matches manual changelog inspection (§6.6)', () => {
  it('computes days since last transition into the current blocked status', () => {
    const hist: StatusTransition[] = [
      { issue_key: 'X-1', from_status: null, to_status: 'new', changed_at: '2026-06-01T00:00:00Z' },
      { issue_key: 'X-1', from_status: 'new', to_status: 'in dev', changed_at: '2026-06-05T00:00:00Z' },
      { issue_key: 'X-1', from_status: 'in dev', to_status: 'dev blocked', changed_at: '2026-06-10T00:00:00Z' },
      { issue_key: 'X-1', from_status: 'dev blocked', to_status: 'in dev', changed_at: '2026-06-15T00:00:00Z' },
      { issue_key: 'X-1', from_status: 'in dev', to_status: 'dev blocked', changed_at: '2026-06-28T00:00:00Z' },
    ];
    const issue: Issue = {
      issue_key: 'X-1', issue_type: 'Story', summary: 'X', status: 'dev blocked', category: 'C',
      feature_id: 'F', epic_key: 'E', parent_key: 'E', milestone_id: 'M1',
      is_scope_overflow_inherited: false, scope_disposition: null,
      created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-28T00:00:00Z',
    };
    const m = computeIssueMetrics([issue], indexHistory(hist), new Date('2026-07-03T10:30:00Z'));
    // last transition INTO dev blocked was 2026-06-28, i.e. 5 full days ago
    expect(m.get('X-1')!.blocked_age_days).toBe(5);
    expect(m.get('X-1')!.effective_stage).toBe('in dev');
    expect(m.get('X-1')!.stage_entered_at).toBe('2026-06-28T00:00:00Z');
  });

  it('real dataset blocked ages agree with raw history', () => {
    const blocked = issues.filter((i) => ['dev blocked', 'qa blocked'].includes(i.status) && i.issue_type !== 'Epic');
    expect(blocked.length).toBeGreaterThanOrEqual(5);
    for (const i of blocked.slice(0, 5)) {
      const rows = history.filter((h) => h.issue_key === i.issue_key && h.to_status === i.status);
      const manual = Math.floor((TODAY.getTime() - Date.parse(rows[rows.length - 1].changed_at)) / 86400000);
      expect(ds.metrics.get(i.issue_key)!.blocked_age_days).toBe(manual);
    }
  });
});

describe('amendment A1 — scope_disposition grain', () => {
  it('holds across the whole dataset', () => {
    for (const i of issues) {
      if (i.issue_type !== 'Epic') {
        expect(i.scope_disposition).toBeNull(); // rule 1+2: epic-only, never inherited
      } else if (i.is_scope_overflow_inherited) {
        expect(i.scope_disposition).not.toBeNull(); // rule 3
      } else {
        expect(i.scope_disposition).toBeNull();
      }
    }
  });

  it('descendants inherit the epic flag exactly', () => {
    const byKey = new Map(issues.map((i) => [i.issue_key, i]));
    for (const i of issues) {
      if (i.epic_key) {
        expect(i.is_scope_overflow_inherited).toBe(byKey.get(i.epic_key)!.is_scope_overflow_inherited);
      }
    }
  });
});

describe('expected curve', () => {
  it('is linear between start and due, clamped outside', () => {
    const m: Milestone = { milestone_id: 'T', name: 'T', start_date: '2026-01-01', due_date: '2026-01-11', expected_curve: 'linear' };
    expect(expectedPct(m, new Date('2025-12-25T00:00:00Z'))).toBe(0);
    expect(expectedPct(m, new Date('2026-01-06T00:00:00Z'))).toBe(50);
    expect(expectedPct(m, new Date('2026-02-01T00:00:00Z'))).toBe(100);
  });
});
