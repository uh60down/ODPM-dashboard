import type { WeeklyPoint } from '../lib/timeline';

const fmtDate = (d: Date) =>
  `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;

/** 12-point KPI sparkline. Renders nothing when the series is null (spec P1). */
export function Sparkline({ pts, color }: { pts: WeeklyPoint[] | null; color: string }) {
  if (!pts || pts.length === 0) return null;
  const w = 150;
  const h = 38;
  const pad = 4;
  const xs = pts.map((p) => p.date.getTime());
  const ys = pts.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yMax = Math.max(...ys, 1);
  const yMin = Math.min(...ys, 0);
  const X = (t: number) => pad + ((t - x0) / Math.max(x1 - x0, 1)) * (w - 2 * pad);
  const Y = (v: number) => h - pad - ((v - yMin) / Math.max(yMax - yMin, 1)) * (h - 2 * pad);
  const line = pts.map((p) => `${X(p.date.getTime()).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  const area = `${X(x0).toFixed(1)},${h - pad} ${line} ${X(x1).toFixed(1)},${h - pad}`;
  const last = pts[pts.length - 1];
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(last.date.getTime())} cy={Y(last.value)} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

export interface LineSeries {
  label: string;
  color: string;
  dashed?: boolean;
  points: { x: number; y: number }[];
}

/** Shared time/value line chart (burn line, exposure trend). One y axis. */
export function LineChart({
  series,
  yMax,
  yFmt = (v) => String(Math.round(v)),
  height = 220,
}: {
  series: LineSeries[];
  yMax?: number;
  yFmt?: (v: number) => string;
  height?: number;
}) {
  const w = 620;
  const h = height;
  const m = { top: 12, right: 16, bottom: 26, left: 40 };
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <div className="muted">no data</div>;
  const x0 = Math.min(...all.map((p) => p.x));
  const x1 = Math.max(...all.map((p) => p.x));
  const top = yMax ?? Math.max(...all.map((p) => p.y), 1) * 1.1;
  const X = (t: number) => m.left + ((t - x0) / Math.max(x1 - x0, 1)) * (w - m.left - m.right);
  const Y = (v: number) => h - m.bottom - (v / top) * (h - m.top - m.bottom);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount }, (_, k) => x0 + ((x1 - x0) * k) / (xTickCount - 1));
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }} role="img">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.left} x2={w - m.right} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={m.left - 6} y={Y(v) + 3.5} textAnchor="end" className="axis-text">{yFmt(v)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={X(t)} y={h - 8} textAnchor="middle" className="axis-text">
            {fmtDate(new Date(t))}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              points={s.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '6 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {!s.dashed &&
              s.points.map((p, k) => (
                <circle key={k} cx={X(p.x)} cy={Y(p.y)} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={2}>
                  <title>{`${s.label} — ${fmtDate(new Date(p.x))}: ${yFmt(p.y)}`}</title>
                </circle>
              ))}
          </g>
        ))}
      </svg>
      <div className="legend-row">
        {series.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color, height: s.dashed ? 2 : 3 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two-segment donut (e.g. +scope share). */
export function Donut({
  pct,
  color,
  size = 96,
  label,
}: {
  pct: number;
  color: string;
  size?: number;
  label?: string;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label={label}>
      <circle cx={48} cy={48} r={r} fill="none" stroke="var(--grid)" strokeWidth={12} />
      <circle
        cx={48}
        cy={48}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeDasharray={`${filled} ${c - filled}`}
        strokeDashoffset={c / 4}
        strokeLinecap="butt"
      />
      <text x={48} y={53} textAnchor="middle" className="donut-text">{Math.round(pct)}%</text>
    </svg>
  );
}
