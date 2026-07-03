import { NavLink, Outlet } from 'react-router-dom';
import { dataset } from '../lib/data';
import { HEALTH_LEGEND } from '../lib/health';

const NAV = [
  { to: '/', label: 'Program Overview' },
  { to: '/milestone', label: 'Milestone View' },
  { to: '/drilldown', label: 'Category / Epic View' },
  { to: '/commitment', label: 'Feature Commitment' },
  { to: '/blocked', label: 'Blocked / Chase' },
  { to: '/scope', label: '+Scope Exposure' },
];

/** Spec §0 — displayed verbatim in the dashboard header. */
const CONTRACT = `Delivery Readiness Dashboard
Ontology:     Category → Feature → Epic → Story/Bug
Slice:        Milestone
Done:         QA Pass only
Denominator:  Stories + Bugs`;

export function Layout() {
  const today = dataset.today;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">Mobile App Project</div>
          <div className="brand-sub">Delivery Dashboard</div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-panel">
          <div className="side-panel-title">Cell color = schedule health</div>
          {HEALTH_LEGEND.map((h) => (
            <div key={h.color} className="legend-line">
              <span className={`legend-dot h-${h.color}`} /> {h.label}
            </div>
          ))}
          <div className="side-note">Cell numbers are absolute % QA pass — color never restates the number (D1).</div>
        </div>
        <div className="side-panel">
          <div className="side-panel-title">Done = QA Pass</div>
          <div className="side-note">Only items in “QA Pass” count as done. Everything else is zero progress.</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <h1>Delivery Readiness Dashboard</h1>
            <div className="topbar-sub">
              data as of {today.toISOString().slice(0, 10)} (mocked “today” — static v1)
            </div>
          </div>
          <pre className="contract" title="Spec §0 — every metric on every page is derivable from this contract">{CONTRACT}</pre>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
