import React, { useState, useMemo, useRef } from 'react';

export function Gauge({ value, size = 200, label }) {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  const strokeWidth = 12;
  const r = size / 2 - strokeWidth - 2;
  const c = 2 * Math.PI * r;
  const color = v === null ? '#94a3b8' : v >= 80 ? '#10b981' : v >= 70 ? '#f59e0b' : '#ef4444';
  
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={v === null ? 'Battery health unavailable' : `Battery health ${v} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        {v !== null && (
          <circle 
            cx={size / 2} 
            cy={size / 2} 
            r={r} 
            fill="none" 
            stroke={color} 
            strokeWidth={strokeWidth} 
            strokeLinecap="round"
            strokeDasharray={c} 
            strokeDashoffset={c * (1 - v / 100)} 
            style={{ transition: 'stroke-dashoffset 0.8s ease' }} 
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[40px] leading-none font-bold font-mono text-on-surface tracking-tight">
          {v === null ? '—' : v.toFixed(1).replace(/\.0$/, '')}
          {v !== null && <span className="text-xl text-on-surface-variant font-sans ml-0.5">%</span>}
        </span>
        {label && <span className="mt-1 text-xs font-medium text-on-surface-variant uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}

/** Responsive SVG line chart with explicit telemetry vs prediction distinctions */
export function LineChart({ data, projection = [], xLabel, yLabel, unit = '', height = 270, yMin, yMax, referenceLine, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 720, H = height, P = { l: 48, r: 24, t: 18, b: 40 };
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
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = null, bd = Infinity;
    all.forEach((d) => { const dd = Math.abs(sx(d.x) - px); if (dd < bd) { bd = dd; best = d; } });
    setHover(best);
  };

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-on-surface-variant font-mono gap-3 px-1 border-b border-surface-container-highest/60 pb-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-emerald-600 rounded-full" />
            <span className="text-on-surface font-sans font-medium">Observed Cycles</span>
          </div>
          {projection.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-sky-600" />
              <span className="text-sky-800 font-sans font-medium">Model Projection (Exp.)</span>
            </div>
          )}
          {referenceLine !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t border-dashed border-amber-600" />
              <span className="text-amber-800 font-sans font-medium">80% EOL Threshold</span>
            </div>
          )}
        </div>
        <div className="text-[10px] text-on-surface-variant hidden sm:block">
          {hover ? `${xLabel}: ${hover.x} | ${yLabel}: ${hover.y.toFixed(2)}${unit}` : 'Hover cursor along curve to inspect'}
        </div>
      </div>

      <div className="w-full relative">
        <svg 
          ref={ref} 
          viewBox={`0 0 ${W} ${H}`} 
          className="w-full h-auto cursor-crosshair" 
          role="img" 
          aria-label={ariaLabel || `${yLabel} by ${xLabel}`}
          onMouseMove={onMove} 
          onMouseLeave={() => setHover(null)} 
          onTouchMove={(e) => onMove(e.touches[0])}
        >
          {/* Horizontal gridlines and Y-axis labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="#e2e8f0" strokeDasharray="2 2" strokeWidth="1" />
              <text x={P.l - 8} y={sy(t) + 3.5} textAnchor="end" fontSize="10" fill="#64748b" className="font-mono">
                {t.toFixed(t > 20 ? 0 : 1)}
              </text>
            </g>
          ))}

          {/* Vertical ticks and X-axis labels */}
          {xTicks.map((t, i) => (
            <text key={i} x={sx(t)} y={H - 14} textAnchor="middle" fontSize="10" fill="#64748b" className="font-mono">
              {Math.round(t)}
            </text>
          ))}
          <text x={(W + P.l) / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="#64748b" className="font-mono uppercase font-semibold">
            {xLabel}
          </text>

          {/* Reference Line (80% EOL) */}
          {referenceLine !== undefined && (
            <g>
              <line x1={P.l} x2={W - P.r} y1={sy(referenceLine)} y2={sy(referenceLine)} stroke="#d97706" strokeDasharray="4 4" strokeWidth="1.5" />
              <text x={W - P.r} y={sy(referenceLine) - 5} textAnchor="end" fontSize="10" fill="#b45309" className="font-mono font-semibold">
                EOL ({referenceLine}{unit})
              </text>
            </g>
          )}

          {/* Telemetry Observed Path */}
          {data.length > 0 && (
            <path d={path(data)} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Projected Path */}
          {projection.length > 0 && (
            <path 
              d={path([data[data.length - 1] || projection[0], ...projection])} 
              fill="none" 
              stroke="#0284c7" 
              strokeWidth="2" 
              strokeDasharray="4 4" 
              strokeLinejoin="round" 
            />
          )}

          {/* Hover Crosshair Marker */}
          {hover && (
            <g>
              <line x1={sx(hover.x)} x2={sx(hover.x)} y1={P.t} y2={H - P.b} stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1" />
              <circle cx={sx(hover.x)} cy={sy(hover.y)} r="4.5" fill="#059669" stroke="#ffffff" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>

      <div className="h-5 text-xs text-on-surface-variant font-mono" aria-live="polite">
        {hover ? (
          <span className="font-medium text-on-surface">
            Cycle {hover.x}: <span className="text-primary font-bold">{hover.y.toFixed(2)}{unit}</span>
          </span>
        ) : (
          <span className="text-[11px] text-slate-500">Touch or hover across data points to trace cycle values</span>
        )}
      </div>
    </div>
  );
}
