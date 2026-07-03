import { useState } from 'react';
import { dataset } from '../lib/data';
import type { Issue } from '../lib/types';
import { countable, progressOf, DONE_STATUS } from '../lib/metrics';
import {
  MilestoneTag,
  ProgressBar,
  ScopeTag,
  StageBar,
  StateChip,
  TypeChip,
} from '../components/widgets';

function Arrow({ open }: { open: boolean }) {
  return <span className={`acc-arrow${open ? ' open' : ''}`}>▸</span>;
}

function PctCell({ p }: { p: ReturnType<typeof progressOf> }) {
  return (
    <span className="acc-pct">
      {p.pct == null ? '–' : `${p.pct}%`}{' '}
      <span className="muted" style={{ fontWeight: 400 }}>
        {p.total > 0 ? `${p.done}/${p.total}` : ''}
      </span>
    </span>
  );
}

/** P3 — three-level accordion. Slice dims out-of-slice items, never hides them. */
export function P3Drilldown() {
  const ds = dataset;
  const [slice, setSlice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(ds.categories.slice(0, 1)));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const inSlice = (i: Issue) => slice == null || i.milestone_id === slice;
  const scoped = (items: Issue[]) => (slice == null ? items : items.filter(inSlice));

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="chip-row">
          <button className={`mchip${slice == null ? ' selected' : ''}`} onClick={() => setSlice(null)}>
            All milestones
          </button>
          {ds.milestones.map((m) => (
            <button
              key={m.milestone_id}
              className={`mchip${slice === m.milestone_id ? ' selected' : ''}`}
              onClick={() => setSlice(m.milestone_id)}
            >
              {m.name}
            </button>
          ))}
        </div>
        {slice != null && <span className="muted">out-of-slice items are dimmed, not hidden</span>}
      </div>

      <div className="card">
        {ds.categories.map((cat) => {
          const catItems = scoped(countable(ds.issues).filter((i) => i.category === cat));
          const catP = progressOf(catItems, ds.metrics);
          const catOpen = open.has(cat);
          return (
            <div className="acc-cat" key={cat}>
              <button className="acc-head" onClick={() => toggle(cat)}>
                <Arrow open={catOpen} />
                <span className="acc-title">{cat}</span>
                <span className="acc-meta">
                  <ProgressBar pct={catP.pct} width={160} />
                  <PctCell p={catP} />
                </span>
              </button>
              {catOpen &&
                (ds.featuresByCategory.get(cat) ?? []).map((f) => {
                  const epics = ds.epicsByFeature.get(f.feature_id) ?? [];
                  const fItems = scoped(countable(ds.issues).filter((i) => i.feature_id === f.feature_id));
                  const fP = progressOf(fItems, ds.metrics);
                  const fBlocked = fItems.filter((i) => ds.metrics.get(i.issue_key)?.is_blocked).length;
                  const fOpen = open.has(f.feature_id);
                  return (
                    <div className="acc-children" key={f.feature_id}>
                      <button className="acc-head" onClick={() => toggle(f.feature_id)}>
                        <Arrow open={fOpen} />
                        <span className="acc-title feature">
                          {f.feature_name} <span className="muted">({f.feature_id})</span>
                        </span>
                        <span className="acc-meta">
                          <span className="muted">{epics.length} epics</span>
                          {fBlocked > 0 && <span className="badge-blocked">{fBlocked} blocked</span>}
                          <StageBar items={fItems} />
                          <PctCell p={fP} />
                        </span>
                      </button>
                      {fOpen &&
                        epics.map((e) => {
                          const eAll = ds.childrenByEpic.get(e.issue_key) ?? [];
                          const eItems = scoped(eAll);
                          const eP = progressOf(eItems, ds.metrics);
                          const eOpen = open.has(e.issue_key);
                          return (
                            <div className="acc-children" key={e.issue_key}>
                              <button className="acc-head" onClick={() => toggle(e.issue_key)}>
                                <Arrow open={eOpen} />
                                <span className="acc-title epic">
                                  {e.summary} <span className="muted">({e.issue_key})</span>
                                </span>
                                <span className="acc-meta">
                                  <ScopeTag flagged={e.is_scope_overflow_inherited} />
                                  <ProgressBar pct={eP.pct} width={120} />
                                  <PctCell p={eP} />
                                </span>
                              </button>
                              {eOpen && (
                                <div className="acc-children">
                                  {eAll.map((i) => {
                                    const subs = ds.subtasksByStory.get(i.issue_key) ?? [];
                                    const subsDone = subs.filter((s) => s.status === DONE_STATUS).length;
                                    return (
                                      <div className={`item-row${inSlice(i) ? '' : ' dimmed'}`} key={i.issue_key}>
                                        <span className="item-key">{i.issue_key}</span>
                                        <TypeChip type={i.issue_type} />
                                        <span style={{ flex: 1 }}>{i.summary}</span>
                                        <MilestoneTag id={i.milestone_id} ds={ds} />
                                        {i.issue_type === 'Story' && subs.length > 0 && (
                                          <span className="muted" title="subtasks done/total (display only — never in the denominator, D2)">
                                            ⊟ {subsDone}/{subs.length}
                                          </span>
                                        )}
                                        <StateChip status={i.status} />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </>
  );
}
