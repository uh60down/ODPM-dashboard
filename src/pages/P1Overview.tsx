import { Link } from 'react-router-dom';
import { currentMilestone, dataset } from '../lib/data';
import { countable, progressOf, scopeExposure, featureDelivered } from '../lib/metrics';
import {
  blockedCountSeries,
  deliveredFeaturesSeries,
  exposureSeries,
  keysWhere,
  oldestBlockedSeries,
  pctSeries,
} from '../lib/derived';
import { KpiCard, MatrixTable, Funnel } from '../components/widgets';
import { Donut } from '../components/charts';
import { BlockedTopTable } from '../components/BlockedTopTable';

export function P1Overview() {
  const ds = dataset;
  const cur = currentMilestone(ds.milestones, ds.today);
  const all = countable(ds.issues);
  const prog = progressOf(all, ds.metrics);
  const slice = countable(ds.issues, cur.milestone_id);
  const readiness = progressOf(slice, ds.metrics);
  const delivered = ds.features.filter((f) => featureDelivered(f.feature_id, ds.issues)).length;
  const devBlocked = all.filter((i) => i.status === 'dev blocked').length;
  const qaBlocked = all.filter((i) => i.status === 'qa blocked').length;
  const exposure = scopeExposure(all);

  const flaggedEpics = ds.issues
    .filter((i) => i.issue_type === 'Epic' && i.is_scope_overflow_inherited)
    .map((e) => {
      const items = all.filter((i) => i.epic_key === e.issue_key);
      return { epic: e, count: items.length };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <div className="grid-kpi">
        <KpiCard
          label="Program progress"
          value={prog.pct == null ? '–' : `${prog.pct}%`}
          sub={`${prog.done} / ${prog.total} items · all milestones`}
          spark={pctSeries()}
          color="var(--blue)"
        />
        <KpiCard
          label={`${cur.name} readiness`}
          value={readiness.pct == null ? '–' : `${readiness.pct}%`}
          sub={`${readiness.done} / ${readiness.total} items in slice`}
          spark={pctSeries(keysWhere((i) => i.milestone_id === cur.milestone_id))}
          color="#008300"
        />
        <KpiCard
          label="Features delivered"
          value={
            <>
              {delivered}
              <span className="kpi-unit"> / {ds.features.length}</span>
            </>
          }
          sub={`${Math.round((100 * delivered) / ds.features.length)}% fully QA-passed`}
          spark={deliveredFeaturesSeries()}
          color="var(--violet)"
        />
        <KpiCard
          label="Blocked now"
          value={devBlocked + qaBlocked}
          sub={`${devBlocked} dev blocked · ${qaBlocked} qa blocked`}
          spark={blockedCountSeries()}
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
          spark={oldestBlockedSeries()}
          color="var(--orange)"
        />
        <KpiCard
          label="+Scope exposure"
          value={exposure.pct == null ? '–' : `${exposure.pct}%`}
          sub={`${exposure.flagged} / ${exposure.total} items flagged`}
          spark={exposureSeries()}
          color="var(--aqua)"
        />
      </div>

      <div className="card">
        <h2>Progress by Category × Milestone</h2>
        <div className="card-sub">number = absolute % QA pass · color = schedule health vs due date (D1)</div>
        <div className="table-wrap">
          <MatrixTable ds={ds} />
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Lifecycle funnel</h2>
          <div className="card-sub">Stories + Bugs by effective stage · blocked shown as thin red interruptions</div>
          <Funnel items={all} ds={ds} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h2>Blocked — top 5</h2>
            <div className="card-sub">sorted by blocked age, descending</div>
            <BlockedTopTable limit={5} />
            <div style={{ marginTop: 8 }}>
              <Link to="/blocked">View all blocked items →</Link>
            </div>
          </div>
          <div className="card">
            <h2>+Scope summary</h2>
            <div className="scope-flex">
              <Donut pct={exposure.pct ?? 0} color="var(--aqua)" label="+scope exposure" />
              <div>
                <div className="kpi-sub">
                  {exposure.flagged} / {exposure.total} items sit under {flaggedEpics.length} flagged epics
                </div>
                <ol className="scope-top-list">
                  {flaggedEpics.slice(0, 3).map(({ epic, count }) => (
                    <li key={epic.issue_key}>
                      {epic.summary} <span className="muted">({count} items)</span>
                    </li>
                  ))}
                </ol>
                <Link to="/scope">View all +scope epics →</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
