import { useState } from 'react';
import { currentMilestone, dataset } from '../lib/data';
import { countable, featureDelivered, progressOf, scopeExposure, DONE_STATUS } from '../lib/metrics';
import { keysWhere, pctSeries, sampleDates, snapshots } from '../lib/derived';
import { doneCountAt } from '../lib/timeline';
import { KpiCard, MatrixTable, Funnel, MilestoneChips } from '../components/widgets';
import { LineChart } from '../components/charts';
import { BlockedTopTable } from '../components/BlockedTopTable';

export function P2Milestone() {
  const ds = dataset;
  const [selected, setSelected] = useState(() => currentMilestone(ds.milestones, ds.today).milestone_id);
  const m = ds.milestones.find((x) => x.milestone_id === selected)!;
  const items = countable(ds.issues, selected);
  const prog = progressOf(items, ds.metrics);
  const devBlocked = items.filter((i) => i.status === 'dev blocked').length;
  const qaBlocked = items.filter((i) => i.status === 'qa blocked').length;
  const exposure = scopeExposure(items);
  const delivered = ds.features.filter((f) => featureDelivered(f.feature_id, ds.issues, selected)).length;
  const featuresInSlice = ds.features.filter((f) => items.some((i) => i.feature_id === f.feature_id)).length;
  const sliceKeys = keysWhere((i) => i.milestone_id === selected);

  // Burn line: weekly actual done-count vs linear expected line to due date
  const start = Date.parse(m.start_date ?? m.due_date);
  const due = Date.parse(m.due_date);
  const actualPts = snapshots
    .map((s, k) => ({ x: sampleDates[k].getTime(), y: doneCountAt(s, sliceKeys) }))
    .filter((p) => p.x >= start - 7 * 86400000);
  const expectedPts = [
    { x: start, y: 0 },
    { x: due, y: prog.total },
  ];

  const remaining = ds.categories
    .map((cat) => ({
      cat,
      open: items.filter((i) => i.category === cat && i.status !== DONE_STATUS).length,
    }))
    .filter((r) => r.open > 0)
    .sort((a, b) => b.open - a.open);
  const maxOpen = Math.max(...remaining.map((r) => r.open), 1);

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <MilestoneChips ds={ds} selected={selected} onSelect={(id) => id && setSelected(id)} />
        <span className="muted">
          {m.start_date} → due {m.due_date}
          {currentMilestone(ds.milestones, ds.today).milestone_id === selected ? ' · current' : ''}
        </span>
      </div>

      <div className="grid-kpi">
        <KpiCard
          label={`${m.name} readiness`}
          value={prog.pct == null ? '–' : `${prog.pct}%`}
          sub={`${prog.done} / ${prog.total} items`}
          spark={pctSeries(sliceKeys)}
          color="#008300"
        />
        <KpiCard
          label="Features delivered in slice"
          value={
            <>
              {delivered}
              <span className="kpi-unit"> / {featuresInSlice}</span>
            </>
          }
          sub="strict rule, within this milestone"
          color="var(--violet)"
        />
        <KpiCard
          label="Blocked in slice"
          value={devBlocked + qaBlocked}
          sub={`${devBlocked} dev blocked · ${qaBlocked} qa blocked`}
          color="#d03b3b"
        />
        <KpiCard
          label="Oldest blocked"
          value={
            prog.oldestBlockedDays == null ? '–' : (
              <>
                {prog.oldestBlockedDays}
                <span className="kpi-unit"> days</span>
              </>
            )
          }
          sub={prog.oldestBlockedKey ?? 'nothing blocked'}
          color="var(--orange)"
        />
        <KpiCard
          label="+Scope exposure in slice"
          value={exposure.pct == null ? '–' : `${exposure.pct}%`}
          sub={`${exposure.flagged} / ${exposure.total} items`}
          color="var(--aqua)"
        />
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Burn line</h2>
          <div className="card-sub">actual QA-passed count (weekly reconstruction) vs linear expected to due date</div>
          <LineChart
            series={[
              { label: 'expected (linear)', color: 'var(--muted)', dashed: true, points: expectedPts },
              { label: 'actual done', color: 'var(--blue)', points: actualPts },
            ]}
            yMax={Math.max(prog.total, 1)}
          />
        </div>
        <div className="card">
          <h2>Remaining by category</h2>
          <div className="card-sub">open (not QA-passed) items in this milestone</div>
          {remaining.length === 0 && <div className="muted">nothing open 🎉</div>}
          <table>
            <tbody>
              {remaining.map((r) => (
                <tr key={r.cat}>
                  <td style={{ width: 130 }}>{r.cat}</td>
                  <td>
                    <span className="pbar" style={{ width: `${(100 * r.open) / maxOpen}%`, maxWidth: 220 }}>
                      <span className="pbar-fill" style={{ width: '100%', background: '#5598e7' }} />
                    </span>
                  </td>
                  <td style={{ width: 40, fontWeight: 650 }}>{r.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Progress by category — {m.name}</h2>
        <div className="card-sub">number = absolute % QA pass · color = schedule health (D1)</div>
        <div className="table-wrap">
          <MatrixTable ds={ds} sliceId={selected} />
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Lifecycle funnel — {m.name}</h2>
          <Funnel items={items} ds={ds} />
        </div>
        <div className="card">
          <h2>Blocked in {m.name} — top 5</h2>
          <BlockedTopTable limit={5} sliceId={selected} />
        </div>
      </div>
    </>
  );
}
