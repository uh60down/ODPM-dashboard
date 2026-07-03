import { dataset } from '../lib/data';
import { countable, featureDelivered, progressOf, scopeExposure } from '../lib/metrics';

/**
 * P4 — stakeholder view. Features only: no epics, no +scope internals.
 * The one-line internal delta is marked "internal" — v1 has no auth, so the
 * marking stands in for visibility control (see README open questions).
 */
export function P4Commitment() {
  const ds = dataset;
  const all = countable(ds.issues);
  const rows = ds.features.map((f) => {
    const items = all.filter((i) => i.feature_id === f.feature_id);
    const p = progressOf(items, ds.metrics);
    const spread = ds.milestones
      .map((m) => ({ m, p: progressOf(items.filter((i) => i.milestone_id === m.milestone_id), ds.metrics) }))
      .filter((x) => x.p.total > 0);
    return { f, p, spread, delivered: featureDelivered(f.feature_id, ds.issues) };
  });

  const exposure = scopeExposure(all);
  const committed = exposure.total - exposure.flagged;
  const deltaPct = committed > 0 ? Math.round((100 * exposure.flagged) / committed) : 0;

  const exportCsv = () => {
    const header = ['feature', 'category', 'delivered', 'pct', 'milestone_spread'];
    const lines = rows.map((r) =>
      [
        r.f.feature_name,
        r.f.category,
        r.delivered ? 'yes' : 'no',
        r.p.pct == null ? '' : r.p.pct,
        r.spread.map((s) => `${s.m.name}: ${s.p.pct}%`).join(' | '),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature-commitment-${ds.today.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Feature commitment — agreement view</h2>
          <div className="card-sub" style={{ marginBottom: 0 }}>
            the external-facing number · delivered = every Story+Bug under every epic QA-passed (strict)
          </div>
        </div>
        <button className="btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="note-internal">
        <span className="chip">internal</span>
        internal scope runs {deltaPct}% above committed ({exposure.flagged} +scope items on top of {committed} committed)
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Category</th>
              <th>Delivered</th>
              <th>Progress</th>
              <th>Milestone spread</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, p, spread, delivered }) => (
              <tr key={f.feature_id}>
                <td>
                  <b>{f.feature_name}</b> <span className="muted">({f.feature_id})</span>
                </td>
                <td>{f.category}</td>
                <td>
                  <span className={`chip ${delivered ? 'chip-delivered' : 'chip-not-delivered'}`}>
                    {delivered ? 'yes' : 'no'}
                  </span>
                </td>
                <td style={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                  {p.pct == null ? '–' : `${p.pct}%`}{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {p.done}/{p.total}
                  </span>
                </td>
                <td>
                  {spread.map((s) => (
                    <span
                      key={s.m.milestone_id}
                      className="chip chip-milestone"
                      style={{ marginRight: 6 }}
                      title={`${s.m.name} · due ${s.m.due_date}`}
                    >
                      {s.m.milestone_id} · {s.p.pct}%
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
