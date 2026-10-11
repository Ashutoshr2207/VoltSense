import React, { useState, useMemo, useRef } from 'react';

export function Gauge({ value, size = 200, label }) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null;
  const r = size / 2 - 14, c = 2 * Math.PI * r;
  const color = v === null ? '#bccabf' : v >= 80 ? '#19a974' : v >= 70 ? '#d97706' : '#ba1a1a';
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={v === null ? 'Battery health unavailable' : `Battery health ${v} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ededf2" strokeWidth="12" />
        {v !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .8s ease' }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] leading-none font-semibold text-on-surface">{v === null ? '—' : v.toFixed(1).replace(/\.0$/, '')}{v !== null && <span className="text-2xl text-on-surface-variant">%</span>}</span>
        {label && <span className="mt-1 text-body-sm text-on-surface-variant">{label}</span>}
      </div>
    </div>
  );
}

/** Simple responsive SVG line chart. data: [{x, y}] ; optional dashed `projection`. */
export function LineChart({ data, projection = [], xLabel, yLabel, unit = '', height = 260, yMin, yMax, referenceLine, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 720, H = height, P = { l: 48, r: 16, t: 14, b: 36 };
  const all = [...data, ...projection];
  const calc = useMemo(() => {
    if (!all.length) return null;
    const xs = all.map((d) => d.x), ys = all.map((d) => d.y);
    let lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys);
    if (referenceLine !== undefined) { lo = Math.min(lo, referenceLine); }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const x0 = Math.min(...xs), x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
    const sx = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
    const sy = (y) => P.t + (1 - (y - lo) / (hi - lo)) * (H - P.t - P.b);
    return { lo, hi, x0, x1, sx, sy };
  }, [data, projection, yMin, yMax, referenceLine, H]);
  if (!calc) return null;
  const { lo, hi, x0, x1, sx, sy } = calc;
  const path = (pts) => pts.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = null, bd = Infinity;
    data.forEach((d) => { const dd = Math.abs(sx(d.x) - px); if (dd < bd) { bd = dd; best = d; } });
    setHover(best);
  };
  return (
    <div className="w-full">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel || `${yLabel} by ${xLabel}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={(e) => onMove(e.touches[0])}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="#ededf2" />
            <text x={P.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#6d7a71">{t.toFixed(t > 20 ? 0 : 1)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => <text key={i} x={sx(t)} y={H - 14} textAnchor="middle" fontSize="11" fill="#6d7a71">{Math.round(t)}</text>)}
        <text x={(W + P.l) / 2} y={H - 1} textAnchor="middle" fontSize="11" fill="#6d7a71">{xLabel}</text>
        {referenceLine !== undefined && (
          <g><line x1={P.l} x2={W - P.r} y1={sy(referenceLine)} y2={sy(referenceLine)} stroke="#d97706" strokeDasharray="4 4" />
            <text x={W - P.r} y={sy(referenceLine) - 4} textAnchor="end" fontSize="11" fill="#b45309">End-of-life level ({referenceLine}{unit})</text></g>
        )}
        <path d={path(data)} fill="none" stroke="#19a974" strokeWidth="2.5" strokeLinejoin="round" />
        {projection.length > 0 && <path d={path([data[data.length - 1], ...projection])} fill="none" stroke="#19a974" strokeWidth="2" strokeDasharray="5 5" opacity=".6" />}
        {hover && (
          <g>
            <line x1={sx(hover.x)} x2={sx(hover.x)} y1={P.t} y2={H - P.b} stroke="#bccabf" />
            <circle cx={sx(hover.x)} cy={sy(hover.y)} r="5" fill="#19a974" stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      <div className="h-6 text-body-sm text-on-surface-variant" aria-live="polite">
        {hover ? `${xLabel} ${hover.x}: ${hover.y.toFixed(2)}${unit}` : 'Hover or touch the chart to see values'}
      </div>
    </div>
  );
}
