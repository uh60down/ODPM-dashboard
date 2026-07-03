import { dataset } from '../lib/data';
import { countable, progressOf, scopeExposure } from '../lib/metrics';
import { exposureSeries } from '../lib/derived';
import { DispositionChip, ProgressBar } from '../components/widgets';
import { LineChart } from '../components/charts';

/**
 * P6 — +scope exposure. Disposition (amendment A1) is read from the Epic row
 * only; 'undecided' epics sort to the top — they are the ones awaiting a call.
 */
export function P6Scope() {
  const ds = dataset;
  const all = countable(ds.issues);
  const exposure = scopeExposure(all);
  const trend = exposureSeries();

  const flaggedEpics = ds.issues
    .filter((i) => i.issue_type === 'Epic' && i.is_scope_overflow_inherited)
    .map((e) => {
      const items = all.filter((i) => i.epic_key === e.issue_key);
      const feature = ds.features.find((f) => f.feature_id === e.feature_id)!;
      return { e, feature, items, p: progressOf(items, ds.metrics) };
    })
    // undecided first (A1 rule 4), then by exposure size
    .sort((a, b) => {
      const ua = a.e.scope_disposition === 'undecided' ? 0 : 1;
      const ub = b.e.scope_disposition === 'undecided' ? 0 : 1;
      return ua - ub || b.items.length - a.items.length;
    });

  // group rows by feature, preserving the sort of each group's best row
  const groups: { feature: (typeof flaggedEpics)[number]['feature']; rows: typeof flaggedEpics }[] = [];
  for (const row of flaggedEpics) {
    const g = groups.find((x) => x.feature.feature_id === row.feature.feature_id);
    if (g) g.rows.push(row);
    else groups.push({ feature: row.feature, rows: [row] });
  }

  return (
    <>
      <div className="card">
        <h2>Exposure trend</h2>
        <div className="card-sub">
          weekly reconstruction · currently {exposure.pct}% ({exposure.flagged} / {exposure.total} Stories+Bugs
          under {flaggedEpics.length} flagged epics)
        </div>
        {trend ? (
          <LineChart
            series={[{ label: '+scope exposure %', color: 'var(--aqua)', points: trend.map((p) => ({ x: p.date.getTime(), y: p.value })) }]}
            yMax={Math.ceil((Math.max(...trend.map((p) => p.value), 10) * 1.3) / 10) * 10}
            yFmt={(v) => `${Math.round(v)}%`}
          />
        ) : (
          <div className="muted">not enough weekly history to reconstruct a trend</div>
        )}
      </div>

      <div className="card table-wrap">
        <h2>Flagged epics by feature</h2>
        <div className="card-sub">
          each row answers: which commitment does this overflow inflate? · disposition is human-maintained
          (default “undecided”); undecided rows sort to top
        </div>
        <table>
          <thead>
            <tr>
              <th>Epic</th>
              <th>Items</th>
              <th>Share of feature</th>
              <th>Progress</th>
              <th>Disposition</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const featureItems = all.filter((i) => i.feature_id === g.feature.feature_id);
              return [
                <tr className="group-head" key={g.feature.feature_id}>
                  <td colSpan={5}>
                    {g.feature.category} › {g.feature.feature_name} ({g.feature.feature_id}) — commitment inflated
                    by {g.rows.reduce((s, r) => s + r.items.length, 0)} +scope items
                  </td>
                </tr>,
                ...g.rows.map((r) => (
                  <tr key={r.e.issue_key}>
                    <td>
                      <b>{r.e.summary}</b> <span className="muted">({r.e.issue_key})</span>
                    </td>
                    <td>{r.items.length} Stories+Bugs</td>
                    <td>
                      {featureItems.length > 0 ? `${Math.round((100 * r.items.length) / featureItems.length)}%` : '–'}
                    </td>
                    <td>
                      <ProgressBar pct={r.p.pct} width={110} />{' '}
                      <span style={{ fontWeight: 650 }}>{r.p.pct == null ? '–' : `${r.p.pct}%`}</span>{' '}
                      <span className="muted">{r.p.done}/{r.p.total}</span>
                    </td>
                    <td><DispositionChip d={r.e.scope_disposition} /></td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
