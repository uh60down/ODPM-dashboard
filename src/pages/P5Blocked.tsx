import { dataset } from '../lib/data';
import { countable, DONE_STATUS } from '../lib/metrics';
import { StateChip, TypeChip, MilestoneTag } from '../components/widgets';

const DAY = 86400000;

/** P5 — the chase list. Blocked items plus a secondary "stalled" list. */
export function P5Blocked() {
  const ds = dataset;
  const all = countable(ds.issues);

  const blocked = all
    .filter((i) => ds.metrics.get(i.issue_key)!.is_blocked)
    .map((i) => ({ i, m: ds.metrics.get(i.issue_key)! }))
    .sort((a, b) => (b.m.blocked_age_days ?? 0) - (a.m.blocked_age_days ?? 0));

  // Stalled: not blocked, last status change > 14 days ago. Done items are
  // excluded (finished ≠ stalled); untouched backlog rows do qualify.
  const stalled = all
    .filter((i) => {
      const m = ds.metrics.get(i.issue_key)!;
      if (m.is_blocked || i.status === DONE_STATUS || m.stage_entered_at == null) return false;
      return ds.today.getTime() - Date.parse(m.stage_entered_at) > 14 * DAY;
    })
    .map((i) => ({
      i,
      days: Math.floor((ds.today.getTime() - Date.parse(ds.metrics.get(i.issue_key)!.stage_entered_at!)) / DAY),
    }))
    .sort((a, b) => b.days - a.days);

  const path = (key: string | null, category: string, featureId: string) => (
    <span className="path">
      {category} › <b>{featureId}</b> › {key ? ds.issueByKey.get(key)?.summary ?? key : '–'}
    </span>
  );

  return (
    <>
      <div className="card table-wrap">
        <h2>Blocked items ({blocked.length})</h2>
        <div className="card-sub">sorted by age · rows at ≥ 7 days highlighted</div>
        {blocked.length === 0 ? (
          <div className="muted">nothing blocked</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Item</th>
                <th>Milestone</th>
                <th>Phase</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map(({ i, m }) => (
                <tr key={i.issue_key} className={(m.blocked_age_days ?? 0) >= 7 ? 'row-hot' : ''}>
                  <td>{path(i.epic_key, i.category, i.feature_id)}</td>
                  <td>
                    <b>{i.issue_key}</b> <TypeChip type={i.issue_type} /> {i.summary}
                  </td>
                  <td><MilestoneTag id={i.milestone_id} ds={ds} /></td>
                  <td><StateChip status={i.status} /></td>
                  <td className={(m.blocked_age_days ?? 0) >= 7 ? 'age-hot' : ''}>{m.blocked_age_days} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card table-wrap">
        <h2>Stalled items ({stalled.length})</h2>
        <div className="card-sub">not blocked, but no status change for &gt; 14 days (done items excluded)</div>
        {stalled.length === 0 ? (
          <div className="muted">nothing stalled</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Item</th>
                <th>Milestone</th>
                <th>Stage</th>
                <th>Days in stage</th>
              </tr>
            </thead>
            <tbody>
              {stalled.map(({ i, days }) => (
                <tr key={i.issue_key}>
                  <td>{path(i.epic_key, i.category, i.feature_id)}</td>
                  <td>
                    <b>{i.issue_key}</b> <TypeChip type={i.issue_type} /> {i.summary}
                  </td>
                  <td><MilestoneTag id={i.milestone_id} ds={ds} /></td>
                  <td><StateChip status={i.status} /></td>
                  <td>{days} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
