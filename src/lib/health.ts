/**
 * Schedule health (spec §2.1, decision D1). The cell NUMBER is always the
 * absolute actual pct; COLOR carries only health relative to the milestone
 * due date. Linear expected curve only in v1.
 */
import type { HealthColor, Milestone } from './types';

const DAY = 86400000;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function expectedPct(m: Milestone, today: Date, milestones?: Milestone[]): number {
  const start = resolveStart(m, milestones);
  const due = Date.parse(m.due_date);
  if (due <= start) return 100;
  const frac = clamp((today.getTime() - start) / (due - start), 0, 1);
  return 100 * frac;
}

/** start_date default: previous milestone's due_date (spec §1.1). */
function resolveStart(m: Milestone, milestones?: Milestone[]): number {
  if (m.start_date) return Date.parse(m.start_date);
  if (milestones) {
    const due = Date.parse(m.due_date);
    const prev = milestones
      .filter((o) => Date.parse(o.due_date) < due)
      .sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
    if (prev) return Date.parse(prev.due_date);
  }
  return Date.parse(m.due_date) - 60 * DAY; // last resort: 60-day window
}

export function healthRatio(actualPct: number, expected: number): number {
  return actualPct / Math.max(expected, 1);
}

/**
 * Color for a cell showing `actualPct` over `total` items in milestone m.
 *  - no items → gray
 *  - past due & < 100% → red override
 *  - otherwise banded on health_ratio
 */
export function healthColor(
  actualPct: number | null,
  total: number,
  m: Milestone,
  today: Date,
  milestones?: Milestone[],
): HealthColor {
  if (total === 0 || actualPct == null) return 'gray';
  if (today.getTime() > Date.parse(m.due_date) && actualPct < 100) return 'red';
  const ratio = healthRatio(actualPct, expectedPct(m, today, milestones));
  if (ratio >= 1) return 'green';
  if (ratio >= 0.75) return 'yellow';
  if (ratio >= 0.5) return 'orange';
  return 'red';
}

export const HEALTH_LEGEND: { color: HealthColor; label: string }[] = [
  { color: 'green', label: 'at or ahead of burn' },
  { color: 'yellow', label: 'behind, recoverable' },
  { color: 'orange', label: 'at risk' },
  { color: 'red', label: 'off track / missed' },
  { color: 'gray', label: 'no items' },
];
