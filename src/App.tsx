import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { P1Overview } from './pages/P1Overview';
import { P2Milestone } from './pages/P2Milestone';
import { P3Drilldown } from './pages/P3Drilldown';
import { P4Commitment } from './pages/P4Commitment';
import { P5Blocked } from './pages/P5Blocked';
import { P6Scope } from './pages/P6Scope';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<P1Overview />} />
          <Route path="/milestone" element={<P2Milestone />} />
          <Route path="/drilldown" element={<P3Drilldown />} />
          <Route path="/commitment" element={<P4Commitment />} />
          <Route path="/blocked" element={<P5Blocked />} />
          <Route path="/scope" element={<P6Scope />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
