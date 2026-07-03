import { dataset } from '../lib/data';
import { countable } from '../lib/metrics';
import { StateChip, TypeChip } from './widgets';

export function BlockedTopTable({ limit, sliceId }: { limit: number; sliceId?: string | null }) {
  const ds = dataset;
  const rows = countable(ds.issues, sliceId ?? undefined)
    .filter((i) => ds.metrics.get(i.issue_key)?.is_blocked)
    .map((i) => ({ i, m: ds.metrics.get(i.issue_key)! }))
    .sort((a, b) => (b.m.blocked_age_days ?? 0) - (a.m.blocked_age_days ?? 0))
    .slice(0, limit);
  if (rows.length === 0) return <div className="muted">nothing blocked in scope</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Type</th>
            <th>Epic</th>
            <th>Status</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ i, m }) => (
            <tr key={i.issue_key}>
              <td><b>{i.issue_key}</b></td>
              <td><TypeChip type={i.issue_type} /></td>
              <td>{i.epic_key ? ds.issueByKey.get(i.epic_key)?.summary ?? i.epic_key : '–'}</td>
              <td><StateChip status={i.status} /></td>
              <td className={(m.blocked_age_days ?? 0) >= 7 ? 'age-hot' : ''}>
                {m.blocked_age_days} days
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
