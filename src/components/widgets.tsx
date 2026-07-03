import type { ReactNode } from 'react';
import type { Dataset } from '../lib/data';
import type { HealthColor, Issue, Milestone, ScopeDisposition } from '../lib/types';
import { countable, effectiveStage, progressOf, STAGE_ORDER } from '../lib/metrics';
import { expectedPct, healthColor } from '../lib/health';
import { Sparkline } from './charts';
import type { WeeklyPoint } from '../lib/timeline';

// ------------------------------------------------------------------ KPI card

export function KpiCard({
  label,
  value,
  sub,
  spark,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  spark?: WeeklyPoint[] | null;
  color: string;
}) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {sub != null && <div className="kpi-sub">{sub}</div>}
      {/* Sparkline renders nothing when the series is null — element absent, never faked */}
      <Sparkline pts={spark ?? null} color={color} />
    </div>
  );
}

// -------------------------------------------------------- matrix (D1 lives here)

function MatrixCell({ pct, total, done, m, ds }: { pct: number | null; total: number; done: number; m: Milestone; ds: Dataset }) {
  const color: HealthColor = healthColor(pct, total, m, ds.today, ds.milestones);
  const exp = Math.round(expectedPct(m, ds.today, ds.milestones));
  const tip = total === 0 ? 'no items' : `${done}/${total} done · expected ${exp}% at today`;
  return (
    <td className={`cell h-${color}`} title={tip}>
      {pct == null ? '–' : `${pct}%`}
    </td>
  );
}

/** Category × Milestone matrix. Number = absolute % QA pass; color = schedule health. */
export function MatrixTable({ ds, sliceId }: { ds: Dataset; sliceId?: string | null }) {
  const cols = sliceId ? ds.milestones.filter((m) => m.milestone_id === sliceId) : ds.milestones;
  const rows = ds.categories.map((cat) => {
    const cells = cols.map((m) => {
      const items = countable(ds.issues, m.milestone_id).filter((i) => i.category === cat);
      return { m, p: progressOf(items, ds.metrics) };
    });
    const rowTotal = progressOf(
      countable(ds.issues, sliceId ?? undefined).filter((i) => i.category === cat),
      ds.metrics,
    );
    return { cat, cells, rowTotal };
  });
  const colTotals = cols.map((m) => ({ m, p: progressOf(countable(ds.issues, m.milestone_id), ds.metrics) }));
  const grand = progressOf(countable(ds.issues, sliceId ?? undefined), ds.metrics);
  return (
    <table className="matrix">
      <thead>
        <tr>
          <th>Category</th>
          {cols.map((m) => (
            <th key={m.milestone_id}>
              {m.name}
              <span className="th-due">due {m.due_date}</span>
            </th>
          ))}
          {!sliceId && <th className="th-total">Total</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cat}>
            <td className="row-head">{r.cat}</td>
            {r.cells.map(({ m, p }) => (
              <MatrixCell key={m.milestone_id} pct={p.pct} total={p.total} done={p.done} m={m} ds={ds} />
            ))}
            {!sliceId && (
              <td className="cell total-cell" title={`${r.rowTotal.done}/${r.rowTotal.total} done (all milestones — no single due date, so no health color)`}>
                {r.rowTotal.pct == null ? '–' : `${r.rowTotal.pct}%`}
              </td>
            )}
          </tr>
        ))}
        <tr className="total-row">
          <td className="row-head">Total</td>
          {colTotals.map(({ m, p }) => (
            <MatrixCell key={m.milestone_id} pct={p.pct} total={p.total} done={p.done} m={m} ds={ds} />
          ))}
          {!sliceId && (
            <td className="cell total-cell">{grand.pct == null ? '–' : `${grand.pct}%`}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ funnel

/** Ordinal blue ramp for the 7 stages (light→dark with magnitude of doneness). */
export const STAGE_COLORS: Record<string, string> = {
  'new': '#86b6ef',
  'dev ready': '#6da7ec',
  'in dev': '#3987e5',
  'in review': '#256abf',
  'qa ready': '#1c5cab',
  'qa active': '#104281',
  'qa pass': '#0d366b',
};
const BLOCKED_COLOR = '#d03b3b';

export function Funnel({ items, ds }: { items: Issue[]; ds: Dataset }) {
  const stageCounts = new Map<string, number>(STAGE_ORDER.map((s) => [s, 0]));
  let devBlocked = 0;
  let qaBlocked = 0;
  for (const i of items) {
    const st = effectiveStage(i.status);
    stageCounts.set(st, (stageCounts.get(st) ?? 0) + 1);
    if (i.status === 'dev blocked') devBlocked++;
    if (i.status === 'qa blocked') qaBlocked++;
  }
  const max = Math.max(...stageCounts.values(), 1);
  const total = items.length;
  const row = (label: string, count: number, color: string, blocked = false) => (
    <div className={`funnel-row${blocked ? ' funnel-blocked' : ''}`} key={label}>
      <span className="funnel-label" style={blocked ? { color: BLOCKED_COLOR } : undefined}>{label}</span>
      <span className="funnel-count">
        {count}
        <span className="funnel-pct"> ({total ? Math.round((100 * count) / total) : 0}%)</span>
      </span>
      <span className="funnel-track">
        <span
          className="funnel-bar"
          style={{
            width: `${Math.max((100 * count) / max, count > 0 ? 1.5 : 0)}%`,
            background: color,
            height: blocked ? 6 : 16,
          }}
          title={`${label}: ${count}`}
        />
      </span>
    </div>
  );
  const out: ReactNode[] = [];
  for (const s of STAGE_ORDER) {
    out.push(row(s === 'qa pass' ? 'qa pass (done)' : s, stageCounts.get(s) ?? 0, STAGE_COLORS[s]));
    // blocked shown as thin interruptions between stages, red (spec P1)
    if (s === 'in dev') out.push(row('dev blocked', devBlocked, BLOCKED_COLOR, true));
    if (s === 'qa active') out.push(row('qa blocked', qaBlocked, BLOCKED_COLOR, true));
  }
  void ds;
  return <div className="funnel">{out}</div>;
}

// --------------------------------------------------------------- small parts

export function ProgressBar({ pct, width = 120 }: { pct: number | null; width?: number }) {
  return (
    <span className="pbar" style={{ width }}>
      <span className="pbar-fill" style={{ width: `${pct ?? 0}%` }} />
    </span>
  );
}

/** Stacked stage-distribution bar (P3 feature rows). */
export function StageBar({ items }: { items: Issue[] }) {
  const total = items.length;
  if (total === 0) return <span className="muted">–</span>;
  const counts = STAGE_ORDER.map((s) => ({
    s,
    n: items.filter((i) => effectiveStage(i.status) === s).length,
  })).filter((x) => x.n > 0);
  return (
    <span className="stagebar" title={counts.map((c) => `${c.s}: ${c.n}`).join(' · ')}>
      {counts.map((c) => (
        <span key={c.s} className="stagebar-seg" style={{ width: `${(100 * c.n) / total}%`, background: STAGE_COLORS[c.s] }} />
      ))}
    </span>
  );
}

export function StateChip({ status }: { status: string }) {
  const cls =
    status === 'qa pass' ? 'chip-done' : status.includes('blocked') ? 'chip-blocked' : 'chip-active';
  return <span className={`chip ${cls}`}>{status}</span>;
}

export function TypeChip({ type }: { type: string }) {
  return <span className={`chip chip-type chip-type-${type.toLowerCase()}`}>{type}</span>;
}

export function ScopeTag({ flagged }: { flagged: boolean }) {
  return flagged ? <span className="chip chip-scope">+scope</span> : null;
}

export function DispositionChip({ d }: { d: ScopeDisposition | null }) {
  if (!d) return <span className="muted">–</span>;
  return <span className={`chip chip-disp chip-disp-${d}`}>{d}</span>;
}

export function MilestoneTag({ id, ds }: { id: string | null; ds: Dataset }) {
  if (!id) return <span className="muted">–</span>;
  const m = ds.milestones.find((x) => x.milestone_id === id);
  return (
    <span className="chip chip-milestone" title={m ? `${m.name} · due ${m.due_date}` : id}>
      {id}
    </span>
  );
}

/**
 * Milestone selector chips, as prototyped (build-progress-milestones.html):
 * name + due date, mini stage-distribution bar (blocked in red at the end),
 * pass and blocked counts. Chips are always computed over the full dataset.
 */
export function MilestoneChips({
  ds,
  selected,
  onSelect,
  includeAll,
}: {
  ds: Dataset;
  selected: string | null;
  onSelect: (id: string | null) => void;
  includeAll?: boolean;
}) {
  const options: (Milestone | null)[] = includeAll ? [null, ...ds.milestones] : ds.milestones;
  return (
    <div className="chip-row">
      {options.map((m) => {
        const id = m ? m.milestone_id : null;
        const items = countable(ds.issues, id);
        const done = items.filter((i) => ds.metrics.get(i.issue_key)?.is_done).length;
        const blocked = items.filter((i) => ds.metrics.get(i.issue_key)?.is_blocked).length;
        const active = selected === id;
        return (
          <button key={id ?? 'all'} className={`mschip${active ? ' selected' : ''}`} onClick={() => onSelect(id)}>
            <span className="mschip-top">
              <span className="mschip-name">{m ? m.name : 'All milestones'}</span>
              <span className="mschip-due">{m ? `due ${m.due_date}` : `${items.length} items`}</span>
            </span>
            <span className="mschip-mini">
              {STAGE_ORDER.map((s) => {
                const n = items.filter(
                  (i) => effectiveStage(i.status) === s && !ds.metrics.get(i.issue_key)?.is_blocked,
                ).length;
                return n > 0 ? (
                  <span key={s} style={{ width: `${(100 * n) / items.length}%`, background: STAGE_COLORS[s] }} />
                ) : null;
              })}
              {blocked > 0 && (
                <span style={{ width: `${(100 * blocked) / items.length}%`, background: '#d03b3b' }} />
              )}
            </span>
            <span className="mschip-stats">
              <span>{done}/{items.length} pass</span>
              {blocked > 0 && <span className="mschip-blk">{blocked} blk</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
