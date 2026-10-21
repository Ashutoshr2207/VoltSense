import React from 'react';
import { fmt, has } from '../../utils/battery';

/**
 * BatterySpeedometer
 * Intuitive, high-clarity EV instrument cluster gauge with Red (Bad), Yellow (Fine), Green (Good) zones.
 * Engineered for maximum readability at a glance.
 */
export default function BatterySpeedometer({ soh = null, rul = null, temp = null, eolThreshold = 80 }) {
  const hasData = typeof soh === 'number' && Number.isFinite(soh);
  const clampedSoh = hasData ? Math.max(0, Math.min(100, soh)) : null;

  // Status tier
  const tier = !hasData
    ? { key: 'nodata', label: 'NO DATA', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/60', border: 'border-slate-300 dark:border-slate-700', badge: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300', text: 'Upload EV telemetry data to evaluate State of Health.' }
    : clampedSoh >= eolThreshold
    ? { key: 'good', label: 'GOOD', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-500/40', badge: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700', text: 'Battery is operating in prime health with high capacity retention.' }
    : clampedSoh >= 70
    ? { key: 'fine', label: 'FINE', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-500/40', badge: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700', text: 'Moderate capacity fade detected. Vehicle remains fully drivable with minor range loss.' }
    : { key: 'bad', label: 'BAD', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-500/40', badge: 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700', text: 'Critical capacity fade below acceptable threshold. Battery service or replacement advised.' };

  // Angle: 0% -> 180 deg (pointing left), 100% -> 0 deg (pointing right)
  const angleDeg = hasData ? 180 - (clampedSoh / 100) * 180 : 90;
  const rad = (angleDeg * Math.PI) / 180;

  const cx = 180;
  const cy = 160;
  const needleLength = 106;
  const tipX = cx + needleLength * Math.cos(rad);
  const tipY = cy - needleLength * Math.sin(rad);

  // Tapered needle base points (perpendicular to needle direction)
  const baseRadius = 8;
  const p1X = cx + baseRadius * Math.cos(rad + Math.PI / 2);
  const p1Y = cy - baseRadius * Math.sin(rad + Math.PI / 2);
  const p2X = cx + baseRadius * Math.cos(rad - Math.PI / 2);
  const p2Y = cy - baseRadius * Math.sin(rad - Math.PI / 2);

  // Tail counter-weight point
  const tailLength = 18;
  const tailX = cx - tailLength * Math.cos(rad);
  const tailY = cy + tailLength * Math.sin(rad);

  const needlePath = `M ${tailX} ${tailY} L ${p1X} ${p1Y} L ${tipX} ${tipY} L ${p2X} ${p2Y} Z`;

  // Ticks at 0%, 20%, 40%, 60%, 70%, 80%, 100%
  const ticks = [
    { pct: 0, deg: 180, label: '0%' },
    { pct: 20, deg: 144, label: '20%' },
    { pct: 40, deg: 108, label: '40%' },
    { pct: 60, deg: 72, label: '60%' },
    { pct: 70, deg: 54, label: '70%' },
    { pct: 80, deg: 36, label: '80%' },
    { pct: 100, deg: 0, label: '100%' },
  ];

  return (
    <div className="flex flex-col items-center p-6 bg-surface-container-lowest rounded-2xl border border-surface-container-highest/80 shadow-sm w-full">
      {/* Gauge Title Header */}
      <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-surface-container-highest/60 text-xs">
        <span className="font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-primary">speed</span>
          Battery Health Speedometer
        </span>
        <span className="font-mono text-[11px] text-on-surface-variant">
          EOL Standard: {eolThreshold}%
        </span>
      </div>

      {/* SVG Instrument Gauge */}
      <div className="relative w-full max-w-[380px] flex flex-col items-center">
        <svg viewBox="0 0 360 215" className="w-full h-auto overflow-visible" aria-label="Battery health speedometer gauge">
          <defs>
            {/* Glow / shadow for needle */}
            <filter id="gauge-needle-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.35" />
            </filter>
            <linearGradient id="needle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
          </defs>

          {/* Background Outer Track Arc */}
          <path
            d="M 60 160 A 120 120 0 0 1 300 160"
            fill="none"
            stroke="currentColor"
            strokeWidth="18"
            className="text-surface-container-high opacity-40"
            strokeLinecap="round"
          />

          {/* 1. Red Zone: 0% - 69% (Bad Condition) */}
          <path
            d="M 60 160 A 120 120 0 0 1 245.4 59.4"
            fill="none"
            stroke="#ef4444"
            strokeWidth="16"
            strokeLinecap="round"
            className="transition-all"
          />

          {/* 2. Yellow Zone: 70% - 79% (Fine Condition) */}
          <path
            d="M 252.2 64.2 A 120 120 0 0 1 273.3 84.5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="16"
            strokeLinecap="round"
            className="transition-all"
          />

          {/* 3. Green Zone: 80% - 100% (Good Condition) */}
          <path
            d="M 278.3 91.2 A 120 120 0 0 1 300 160"
            fill="none"
            stroke="#10b981"
            strokeWidth="16"
            strokeLinecap="round"
            className="transition-all"
          />

          {/* Dial Radial Tick Marks */}
          {ticks.map((t) => {
            const tRad = (t.deg * Math.PI) / 180;
            const rInner = 132;
            const rOuter = 139;
            const x1 = cx + rInner * Math.cos(tRad);
            const y1 = cy - rInner * Math.sin(tRad);
            const x2 = cx + rOuter * Math.cos(tRad);
            const y2 = cy - rOuter * Math.sin(tRad);
            return (
              <line
                key={t.pct}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#94a3b8"
                strokeWidth={t.pct === 0 || t.pct === 70 || t.pct === 80 || t.pct === 100 ? 2 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Prominent Zone Labels around Arc */}
          <text x="50" y="185" className="text-[12px] font-black fill-red-600 dark:fill-red-400 font-sans" textAnchor="middle">
            BAD
          </text>
          <text x="250" y="38" className="text-[11px] font-bold fill-amber-600 dark:fill-amber-400 font-sans" textAnchor="middle">
            FINE (70%)
          </text>
          <text x="312" y="185" className="text-[12px] font-black fill-emerald-600 dark:fill-emerald-400 font-sans" textAnchor="middle">
            GOOD (80%+)
          </text>

          {/* Needle Layer */}
          {hasData && (
            <g filter="url(#gauge-needle-shadow)" className="transition-transform duration-700 ease-out">
              <path
                d={needlePath}
                fill="url(#needle-gradient)"
                stroke="#be123c"
                strokeWidth="1"
              />
              {/* Highlight line down needle center */}
              <line
                x1={cx}
                y1={cy}
                x2={tipX}
                y2={tipY}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeOpacity="0.7"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Polished Multi-Layer Hub */}
          <circle cx={cx} cy={cy} r="16" className="fill-slate-800 dark:fill-slate-200 shadow-md" />
          <circle cx={cx} cy={cy} r="11" className="fill-slate-950 dark:fill-slate-800" />
          <circle cx={cx} cy={cy} r="5" fill="#f43f5e" />
        </svg>

        {/* Clear Numerical SOH Readout Below Gauge */}
        <div className="flex flex-col items-center mt-3 mb-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-on-surface">
              {hasData ? fmt(clampedSoh, 1) : '—'}
            </span>
            <span className="text-2xl font-bold text-on-surface-variant font-sans">%</span>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant -mt-1">
            Current State of Health
          </span>

          {/* Plain-English High-Contrast Status Badge */}
          <div className={`mt-3 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider ${tier.badge} flex items-center gap-2 shadow-xs`}>
            <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
            <span>{tier.label} CONDITION</span>
          </div>
        </div>
      </div>

      {/* Everyday Human Explanation Box */}
      <div className={`mt-4 p-4 rounded-xl border ${tier.border} ${tier.bg} w-full text-center max-w-lg`}>
        <p className={`text-sm font-medium ${tier.color} leading-relaxed`}>
          {tier.text}
        </p>
      </div>

      {/* 3 Quick-Take Metric Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-4">
        {/* Remaining Life */}
        <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-highest/80 flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-[22px] text-primary mb-1">
            timelapse
          </span>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Remaining Life</span>
          <span className="text-base font-bold font-mono text-on-surface mt-1">
            {has(rul) ? `${fmt(rul, 0)} cycles` : 'Calculating…'}
          </span>
          <span className="text-[11px] text-on-surface-variant mt-0.5">
            {has(rul) ? (rul > 300 ? 'Plenty of lifespan left' : 'Approaching 80% mark') : 'Needs 7+ cycles'}
          </span>
        </div>

        {/* Operating Temp */}
        <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-highest/80 flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-[22px] text-amber-600 mb-1">
            device_thermostat
          </span>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Pack Temperature</span>
          <span className="text-base font-bold font-mono text-on-surface mt-1">
            {has(temp) ? `${fmt(temp, 1)}°C` : 'Normal (25°C)'}
          </span>
          <span className="text-[11px] text-on-surface-variant mt-0.5">
            {has(temp) && temp >= 35 ? 'Warm — avoid hot parking' : 'Optimal thermal range'}
          </span>
        </div>

        {/* Best Practice */}
        <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-highest/80 flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-[22px] text-emerald-600 mb-1">
            lightbulb
          </span>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Care Recommendation</span>
          <span className="text-xs font-semibold text-on-surface mt-1">
            Charge 20% – 80%
          </span>
          <span className="text-[11px] text-on-surface-variant mt-0.5">
            AC slow charging preserves cells
          </span>
        </div>
      </div>
    </div>
  );
}

