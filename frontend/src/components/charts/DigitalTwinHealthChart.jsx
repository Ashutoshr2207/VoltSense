import React, { useState, useMemo, useRef } from 'react';

/**
 * DigitalTwinHealthChart
 * =====================
 * Premium interactive EV Battery Digital Twin visualization:
 * - View 1: Digital Twin Health & Lifespan Trajectory (Image 1 style)
 *   Multi-series: Past uploads (amber), Actual current telemetry (emerald), Predicted future decay (sky dashed).
 *   Vertical milestone line at current cycle assessment point.
 *   Interactive dark-mode tooltip showing cycle, SOH%, capacity, and assessment.
 * - View 2: Lifecycle Aging Stress Scenarios (Image 2 style)
 *   Comparative degradation curves over vehicle age (Years):
 *   Low Charge Stress (1.5%/yr), Medium Stress (1.9%/yr), High Stress (2.3%/yr).
 * - View 3: Usable Pack Capacity Retention (Image 3 style)
 *   Electrochemical Ampere-hour (Ah) degradation curve over cycles.
 */
export function DigitalTwinHealthChart({
  vehicle,
  historicalData = [], // [{ cycle, soh, capacity, date }]
  predictedData = [],  // [{ cycle, soh }]
  currentCycle = 1,
  currentSoh = 98.5,
  currentCapacityAh = null,
  referenceCapacityAh = null,
  eolThreshold = 80.0,
  estimatedEolCycle = null,
  degradationSlope = -0.05,
}) {
  const [activeTab, setActiveTab] = useState('digital_twin'); // 'digital_twin' | 'stress_scenarios' | 'capacity_ah'
  const [hoverPoint, setHoverPoint] = useState(null);
  const containerRef = useRef(null);

  // Split historicalData into "Past Uploads" and "Current Assessment"
  // If multiple ingestions occurred, the last chunk is "Current", earlier chunks are "Past"
  const { pastSeries, actualSeries } = useMemo(() => {
    if (!historicalData.length) return { pastSeries: [], actualSeries: [] };
    const n = historicalData.length;
    // If there are more than 30 points, the older ones represent past uploads
    const splitIdx = n > 35 ? Math.max(0, n - 30) : 0;
    return {
      pastSeries: historicalData.slice(0, splitIdx),
      actualSeries: historicalData.slice(splitIdx),
    };
  }, [historicalData]);

  // Dimensions
  const W = 840;
  const H = 320;
  const P = { l: 56, r: 28, t: 28, b: 46 };

  // -------------------------------------------------------------
  // View 1: Digital Twin Projection Calculation
  // -------------------------------------------------------------
  const twinCalc = useMemo(() => {
    const allPts = [
      ...historicalData.map((d) => ({ x: d.cycle, y: d.soh, type: 'actual', ...d })),
      ...predictedData.map((d) => ({ x: d.cycle, y: d.soh, type: 'predicted' })),
    ];
    if (!allPts.length) return null;

    const xs = allPts.map((p) => p.x);
    const ys = allPts.map((p) => p.y);

    let loY = Math.min(...ys, eolThreshold) - 1.5;
    let hiY = Math.max(...ys, 100) + 1.0;
    if (hiY - loY < 5) { loY -= 2; hiY += 2; }

    const minX = Math.min(...xs, 1);
    const maxX = Math.max(...xs, currentCycle + 30);

    const sx = (x) => P.l + ((x - minX) / Math.max(1, maxX - minX)) * (W - P.l - P.r);
    const sy = (y) => P.t + (1 - (y - loY) / Math.max(0.1, hiY - loY)) * (H - P.t - P.b);

    return { allPts, minX, maxX, loY, hiY, sx, sy };
  }, [historicalData, predictedData, currentCycle, eolThreshold]);

  // -------------------------------------------------------------
  // View 2: Lifecycle Aging Stress Scenarios Calculation
  // -------------------------------------------------------------
  const stressCalc = useMemo(() => {
    // 0 to 4 years horizon
    const years = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    const lowRate = 1.5;    // % per year
    const medRate = 1.9;    // % per year
    const highRate = 2.4;   // % per year

    const lowPts = years.map((yr) => ({ x: yr, y: Math.max(75, 100 - yr * lowRate) }));
    const medPts = years.map((yr) => ({ x: yr, y: Math.max(75, 100 - yr * medRate) }));
    const highPts = years.map((yr) => ({ x: yr, y: Math.max(75, 100 - yr * highRate) }));

    const minX = 0, maxX = 4.0;
    const minY = 85.0, maxY = 101.0;

    const sx = (x) => P.l + ((x - minX) / (maxX - minX)) * (W - P.l - P.r);
    const sy = (y) => P.t + (1 - (y - minY) / (maxY - minY)) * (H - P.t - P.b);

    // Estimate vehicle's current age based on odometer or cycles
    const estAgeYears = Math.min(3.5, Math.max(0.3, (currentCycle * 4.5) / 365));

    return { years, lowPts, medPts, highPts, minX, maxX, minY, maxY, sx, sy, estAgeYears };
  }, [currentCycle]);

  // -------------------------------------------------------------
  // View 3: Usable Pack Capacity (Ah) Calculation
  // -------------------------------------------------------------
  const capCalc = useMemo(() => {
    const validCapPts = historicalData.filter((d) => typeof d.capacity === 'number' && d.capacity > 0);
    if (!validCapPts.length) return null;

    const xs = validCapPts.map((p) => p.cycle);
    const ys = validCapPts.map((p) => p.capacity);

    let loY = Math.min(...ys) * 0.96;
    let hiY = Math.max(...ys) * 1.03;
    const minX = Math.min(...xs, 1);
    const maxX = Math.max(...xs, 10);

    const sx = (x) => P.l + ((x - minX) / Math.max(1, maxX - minX)) * (W - P.l - P.r);
    const sy = (y) => P.t + (1 - (y - loY) / Math.max(0.1, hiY - loY)) * (H - P.t - P.b);

    return { validCapPts, minX, maxX, loY, hiY, sx, sy };
  }, [historicalData]);

  // Mouse move handler for interactive tooltip
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseSvgX = ((e.clientX - rect.left) / rect.width) * W;

    if (activeTab === 'digital_twin' && twinCalc) {
      let nearest = null;
      let minDelta = Infinity;
      twinCalc.allPts.forEach((pt) => {
        const px = twinCalc.sx(pt.x);
        const d = Math.abs(px - mouseSvgX);
        if (d < minDelta && d < 60) {
          minDelta = d;
          nearest = pt;
        }
      });
      setHoverPoint(nearest);
    } else if (activeTab === 'capacity_ah' && capCalc) {
      let nearest = null;
      let minDelta = Infinity;
      capCalc.validCapPts.forEach((pt) => {
        const px = capCalc.sx(pt.cycle);
        const d = Math.abs(px - mouseSvgX);
        if (d < minDelta && d < 60) {
          minDelta = d;
          nearest = pt;
        }
      });
      setHoverPoint(nearest);
    } else {
      setHoverPoint(null);
    }
  };

  const handleMouseLeave = () => setHoverPoint(null);

  // SVG Path Helper
  const makeSvgPath = (pts, sx, sy) => {
    if (!pts.length) return '';
    return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  };

  return (
    <div className="w-full rounded-2xl bg-surface-container border border-surface-container-highest/80 shadow-lg overflow-hidden flex flex-col">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-surface-container-highest/60 bg-surface-container-high/40">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary">ssid_chart</span>
          <div>
            <h3 className="text-sm font-semibold text-on-surface tracking-tight">
              {activeTab === 'digital_twin'
                ? 'State of Health — Battery Digital Twin'
                : activeTab === 'stress_scenarios'
                ? 'Battery State of Health by Cycling Intensity'
                : 'Electrochemical Pack Capacity Degradation'}
            </h3>
            <p className="text-[11px] text-on-surface-variant font-mono">
              Vehicle ID: {vehicle?.name || 'EV Pack'} • Ref Capacity: {referenceCapacityAh ? `${referenceCapacityAh} Ah` : '—'}
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-xl border border-surface-container-highest/60 text-xs">
          <button
            type="button"
            onClick={() => { setActiveTab('digital_twin'); setHoverPoint(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'digital_twin'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Digital Twin (SOH & Lifespan)
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('stress_scenarios'); setHoverPoint(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'stress_scenarios'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Stress Scenarios (Years)
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('capacity_ah'); setHoverPoint(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'capacity_ah'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Capacity (Ah vs Cycle)
          </button>
        </div>
      </div>

      {/* Legend & Stats Ribbon */}
      <div className="px-5 py-2.5 bg-surface-container-lowest/70 border-b border-surface-container-highest/40 flex flex-wrap items-center justify-between text-xs text-on-surface-variant font-mono gap-3">
        {activeTab === 'digital_twin' && (
          <div className="flex items-center gap-5">
            {pastSeries.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shadow-sm" />
                <span className="text-on-surface font-sans font-medium text-[11px]">Past Uploads</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
              <span className="text-on-surface font-sans font-medium text-[11px]">Actual Measured Cycles</span>
            </div>
            {predictedData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-cyan-400" />
                <span className="text-cyan-400 font-sans font-medium text-[11px]">Predicted EOL Trajectory</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t border-dashed border-red-500" />
              <span className="text-red-400 font-sans font-medium text-[11px]">80% Retirement Threshold</span>
            </div>
          </div>
        )}

        {activeTab === 'stress_scenarios' && (
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-sky-500 rounded-full" />
              <span className="text-sky-300 font-sans font-medium text-[11px]">Low Charge Cycle (1.5%/yr)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-amber-500 rounded-full" />
              <span className="text-amber-300 font-sans font-medium text-[11px]">Medium Commute (1.9%/yr)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-rose-500 rounded-full" />
              <span className="text-rose-300 font-sans font-medium text-[11px]">High Fast-Charge Stress (2.4%/yr)</span>
            </div>
          </div>
        )}

        {activeTab === 'capacity_ah' && (
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm" />
              <span className="text-on-surface font-sans font-medium text-[11px]">Usable Capacity Retention (Ah)</span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant text-[11px]">
              Slope: <span className="font-mono text-primary font-bold ml-1">{degradationSlope ? `${degradationSlope.toFixed(3)} pp/cyc` : '—'}</span>
            </div>
          </div>
        )}

        <div className="text-[11px] text-on-surface-variant font-sans">
          Current Cycle: <strong className="font-mono text-on-surface">{currentCycle}</strong> • Latest SOH: <strong className="font-mono text-emerald-400">{currentSoh?.toFixed(1)}%</strong>
        </div>
      </div>

      {/* Main SVG Interactive Chart Area */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-[320px] bg-surface-container-lowest/90 select-none cursor-crosshair"
      >
        {/* VIEW 1: DIGITAL TWIN PROJECTION */}
        {activeTab === 'digital_twin' && twinCalc && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
            {/* Grid Lines Y-axis */}
            {Array.from({ length: 6 }).map((_, i) => {
              const yVal = twinCalc.loY + ((twinCalc.hiY - twinCalc.loY) * i) / 5;
              const yPos = twinCalc.sy(yVal);
              return (
                <g key={`y-grid-${i}`}>
                  <line x1={P.l} y1={yPos} x2={W - P.r} y2={yPos} stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 3" />
                  <text x={P.l - 8} y={yPos + 3.5} textAnchor="end" fill="currentColor" opacity={0.5} fontSize={10} fontFamily="monospace">
                    {yVal.toFixed(0)}%
                  </text>
                </g>
              );
            })}

            {/* Grid Lines X-axis (Cycles) */}
            {Array.from({ length: 7 }).map((_, i) => {
              const xVal = Math.round(twinCalc.minX + ((twinCalc.maxX - twinCalc.minX) * i) / 6);
              const xPos = twinCalc.sx(xVal);
              return (
                <g key={`x-grid-${i}`}>
                  <line x1={xPos} y1={P.t} x2={xPos} y2={H - P.b} stroke="currentColor" strokeOpacity={0.06} />
                  <text x={xPos} y={H - P.b + 16} textAnchor="middle" fill="currentColor" opacity={0.5} fontSize={10} fontFamily="monospace">
                    {xVal}
                  </text>
                </g>
              );
            })}

            {/* 80% EOL Threshold Reference Line */}
            {eolThreshold >= twinCalc.loY && eolThreshold <= twinCalc.hiY && (
              <g>
                <line
                  x1={P.l}
                  y1={twinCalc.sy(eolThreshold)}
                  x2={W - P.r}
                  y2={twinCalc.sy(eolThreshold)}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                />
                <text x={W - P.r - 4} y={twinCalc.sy(eolThreshold) - 5} textAnchor="end" fill="#f87171" fontSize={10} fontFamily="monospace" fontWeight="600">
                  80% EOL Limit
                </text>
              </g>
            )}

            {/* Current Cycle Milestone (Vertical line matching Image 1) */}
            {currentCycle >= twinCalc.minX && currentCycle <= twinCalc.maxX && (
              <g>
                <line
                  x1={twinCalc.sx(currentCycle)}
                  y1={P.t}
                  x2={twinCalc.sx(currentCycle)}
                  y2={H - P.b}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                />
                <circle cx={twinCalc.sx(currentCycle)} cy={twinCalc.sy(currentSoh)} r={5} fill="#10b981" stroke="#ffffff" strokeWidth={2} />
              </g>
            )}

            {/* Series 1: Past Uploads (if available, golden amber) */}
            {pastSeries.length > 0 && (
              <path
                d={makeSvgPath(pastSeries.map((p) => ({ x: p.cycle, y: p.soh })), twinCalc.sx, twinCalc.sy)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}

            {/* Series 2: Actual Measured Telemetry (emerald) */}
            {actualSeries.length > 0 && (
              <path
                d={makeSvgPath(actualSeries.map((p) => ({ x: p.cycle, y: p.soh })), twinCalc.sx, twinCalc.sy)}
                fill="none"
                stroke="#10b981"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}

            {/* Series 3: Predicted Trajectory into Future Cycles (cyan dashed) */}
            {predictedData.length > 0 && (
              <path
                d={makeSvgPath(
                  [{ x: currentCycle, y: currentSoh }, ...predictedData.map((p) => ({ x: p.cycle, y: p.soh }))],
                  twinCalc.sx,
                  twinCalc.sy
                )}
                fill="none"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            )}

            {/* Data Dots: Actual */}
            {actualSeries.map((pt) => (
              <circle
                key={`actual-pt-${pt.cycle}`}
                cx={twinCalc.sx(pt.cycle)}
                cy={twinCalc.sy(pt.soh)}
                r={3}
                fill="#10b981"
                className="hover:r-5 transition-all"
              />
            ))}

            {/* Data Dots: Predicted Future */}
            {predictedData.map((pt) => (
              <circle
                key={`pred-pt-${pt.cycle}`}
                cx={twinCalc.sx(pt.cycle)}
                cy={twinCalc.sy(pt.soh)}
                r={2.5}
                fill="#06b6d4"
                opacity={0.8}
              />
            ))}

            {/* Hover Indicator Crosshair */}
            {hoverPoint && (
              <g>
                <line
                  x1={twinCalc.sx(hoverPoint.x || hoverPoint.cycle)}
                  y1={P.t}
                  x2={twinCalc.sx(hoverPoint.x || hoverPoint.cycle)}
                  y2={H - P.b}
                  stroke="#38bdf8"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <circle
                  cx={twinCalc.sx(hoverPoint.x || hoverPoint.cycle)}
                  cy={twinCalc.sy(hoverPoint.y || hoverPoint.soh)}
                  r={6}
                  fill="#f43f5e"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* Axis Titles */}
            <text x={W / 2} y={H - 10} textAnchor="middle" fill="currentColor" opacity={0.6} fontSize={11} fontFamily="sans-serif" fontWeight="500">
              Charging Cycle
            </text>
            <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} fill="currentColor" opacity={0.6} fontSize={11} fontFamily="sans-serif" fontWeight="500">
              State of Health (%)
            </text>
          </svg>
        )}

        {/* VIEW 2: LIFECYCLE STRESS SCENARIOS (IMAGE 2 STYLE) */}
        {activeTab === 'stress_scenarios' && stressCalc && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
            {/* Y-axis Grid Lines */}
            {Array.from({ length: 5 }).map((_, i) => {
              const yVal = stressCalc.minY + ((stressCalc.maxY - stressCalc.minY) * i) / 4;
              const yPos = stressCalc.sy(yVal);
              return (
                <g key={`stress-y-${i}`}>
                  <line x1={P.l} y1={yPos} x2={W - P.r} y2={yPos} stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 3" />
                  <text x={P.l - 8} y={yPos + 3.5} textAnchor="end" fill="currentColor" opacity={0.5} fontSize={10} fontFamily="monospace">
                    {yVal.toFixed(0)}%
                  </text>
                </g>
              );
            })}

            {/* X-axis Grid Lines (Years) */}
            {stressCalc.years.map((yr) => {
              const xPos = stressCalc.sx(yr);
              return (
                <g key={`stress-x-${yr}`}>
                  <line x1={xPos} y1={P.t} x2={xPos} y2={H - P.b} stroke="currentColor" strokeOpacity={0.06} />
                  <text x={xPos} y={H - P.b + 16} textAnchor="middle" fill="currentColor" opacity={0.5} fontSize={10} fontFamily="monospace">
                    {yr}
                  </text>
                </g>
              );
            })}

            {/* Low Stress Line */}
            <path
              d={makeSvgPath(stressCalc.lowPts, stressCalc.sx, stressCalc.sy)}
              fill="none"
              stroke="#0284c7"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <text x={stressCalc.sx(3.6)} y={stressCalc.sy(94.6)} fill="#38bdf8" fontSize={11} fontWeight="bold" fontFamily="monospace">
              1.5%/year
            </text>

            {/* Medium Stress Line */}
            <path
              d={makeSvgPath(stressCalc.medPts, stressCalc.sx, stressCalc.sy)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <text x={stressCalc.sx(3.6)} y={stressCalc.sy(93.3)} fill="#fbbf24" fontSize={11} fontWeight="bold" fontFamily="monospace">
              1.9%/year
            </text>

            {/* High Stress Line */}
            <path
              d={makeSvgPath(stressCalc.highPts, stressCalc.sx, stressCalc.sy)}
              fill="none"
              stroke="#ef4444"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <text x={stressCalc.sx(3.6)} y={stressCalc.sy(91.6)} fill="#f87171" fontSize={11} fontWeight="bold" fontFamily="monospace">
              2.4%/year
            </text>

            {/* Current Vehicle Position Pin */}
            <g>
              <line
                x1={stressCalc.sx(stressCalc.estAgeYears)}
                y1={P.t}
                x2={stressCalc.sx(stressCalc.estAgeYears)}
                y2={H - P.b}
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <circle
                cx={stressCalc.sx(stressCalc.estAgeYears)}
                cy={stressCalc.sy(currentSoh)}
                r={6}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth={2}
              />
              <rect
                x={stressCalc.sx(stressCalc.estAgeYears) + 8}
                y={stressCalc.sy(currentSoh) - 24}
                width={130}
                height={26}
                rx={6}
                fill="#0f172a"
                stroke="#10b981"
                strokeWidth={1}
              />
              <text
                x={stressCalc.sx(stressCalc.estAgeYears) + 14}
                y={stressCalc.sy(currentSoh) - 7}
                fill="#34d399"
                fontSize={10}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                Current: {currentSoh?.toFixed(1)}% SOH
              </text>
            </g>

            <text x={W / 2} y={H - 10} textAnchor="middle" fill="currentColor" opacity={0.6} fontSize={11} fontFamily="sans-serif" fontWeight="500">
              Vehicle Age (Years)
            </text>
            <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} fill="currentColor" opacity={0.6} fontSize={11} fontFamily="sans-serif" fontWeight="500">
              State of Health (SOH) %
            </text>
          </svg>
        )}

        {/* VIEW 3: USABLE CAPACITY DEGRADATION (IMAGE 3 STYLE) */}
        {activeTab === 'capacity_ah' && capCalc && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
            {/* Y-axis Grid Lines (Ah) */}
            {Array.from({ length: 5 }).map((_, i) => {
              const yVal = capCalc.loY + ((capCalc.hiY - capCalc.loY) * i) / 4;
              const yPos = capCalc.sy(yVal);
              return (
                <g key={`cap-y-${i}`}>
                  <line x1={P.l} y1={yPos} x2={W - P.r} y2={yPos} stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 3" />
                  <text x={P.l - 8} y={yPos + 3.5} textAnchor="end" fill="currentColor" opacity={0.5} fontSize={10} fontFamily="monospace">
                    {yVal.toFixed(1)} Ah
                  </text>
                </g>
              );
            })}

            {/* X-axis Grid Lines (Cycle Number) */}
            {Array.from({ length: 6 }).map((_, i) => {
              const xVal = Math.round(capCalc.minX + ((capCalc.maxX - capCalc.minX) * i) / 5);
              const xPos = capCalc.sx(xVal);
              return (
                <g key={`cap-x-${i}`}>
                  <line x1={xPos} y1={P.t} x2={xPos} y2={H - P.b} stroke="currentColor" strokeOpacity={0.06} />
                  <text x={xPos} y={H - P.b + 16} textAnchor="middle" fill="currentColor" opacity={0.5} fontSize={10} fontFamily="monospace">
                    {xVal}
                  </text>
                </g>
              );
            })}

            {/* Capacity Ah Curve */}
            <path
              d={makeSvgPath(capCalc.validCapPts.map((p) => ({ x: p.cycle, y: p.capacity })), capCalc.sx, capCalc.sy)}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              strokeLinecap="round"
            />

            {/* Data Dots */}
            {capCalc.validCapPts.map((p) => (
              <circle
                key={`cap-pt-${p.cycle}`}
                cx={capCalc.sx(p.cycle)}
                cy={capCalc.sy(p.capacity)}
                r={3}
                fill="#38bdf8"
              />
            ))}

            {/* Hover crosshair */}
            {hoverPoint && (
              <g>
                <circle
                  cx={capCalc.sx(hoverPoint.cycle)}
                  cy={capCalc.sy(hoverPoint.capacity)}
                  r={6}
                  fill="#f43f5e"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </g>
            )}

            <text x={W / 2} y={H - 10} textAnchor="middle" fill="currentColor" opacity={0.6} fontSize={11} fontFamily="sans-serif" fontWeight="500">
              Cycle Number
            </text>
            <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} fill="currentColor" opacity={0.6} fontSize={11} fontFamily="sans-serif" fontWeight="500">
              Capacity (Ah)
            </text>
          </svg>
        )}

        {/* Floating Interactive Tooltip (Styled matching Image 1) */}
        {hoverPoint && activeTab === 'digital_twin' && twinCalc && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
            style={{
              left: `${(twinCalc.sx(hoverPoint.x || hoverPoint.cycle) / W) * 100}%`,
              top: `${(twinCalc.sy(hoverPoint.y || hoverPoint.soh) / H) * 100}%`,
            }}
          >
            <div className="bg-slate-900/95 backdrop-blur-md text-white border border-rose-500/80 rounded-xl px-3.5 py-2.5 shadow-2xl min-w-[150px]">
              <div className="flex items-center justify-between text-[11px] font-mono text-rose-300 font-bold mb-1">
                <span>Charging Cycle: {hoverPoint.x || hoverPoint.cycle}</span>
                <span className="text-[10px] text-slate-400 font-sans">{hoverPoint.type === 'predicted' ? 'Future' : 'Measured'}</span>
              </div>
              <div className="text-base font-bold font-mono tracking-tight text-white">
                SOH: {(hoverPoint.y || hoverPoint.soh)?.toFixed(2)}%
              </div>
              {hoverPoint.capacity && (
                <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                  Capacity: {hoverPoint.capacity?.toFixed(2)} Ah
                </div>
              )}
              {hoverPoint.date && (
                <div className="text-[10px] text-slate-400 mt-1 border-t border-slate-700/60 pt-1">
                  Recorded: {new Date(hoverPoint.date).toLocaleDateString()}
                </div>
              )}
            </div>
            {/* Tooltip caret */}
            <div className="w-2.5 h-2.5 bg-rose-500 transform rotate-45 mx-auto -mt-1.5" />
          </div>
        )}

        {hoverPoint && activeTab === 'capacity_ah' && capCalc && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
            style={{
              left: `${(capCalc.sx(hoverPoint.cycle) / W) * 100}%`,
              top: `${(capCalc.sy(hoverPoint.capacity) / H) * 100}%`,
            }}
          >
            <div className="bg-slate-900/95 backdrop-blur-md text-white border border-sky-500/80 rounded-xl px-3.5 py-2.5 shadow-2xl">
              <div className="text-[11px] font-mono text-sky-300 font-bold mb-1">
                Cycle: {hoverPoint.cycle}
              </div>
              <div className="text-base font-bold font-mono tracking-tight text-white">
                Capacity: {hoverPoint.capacity?.toFixed(2)} Ah
              </div>
              {hoverPoint.date && (
                <div className="text-[10px] text-slate-400 mt-1 border-t border-slate-700/60 pt-1">
                  {new Date(hoverPoint.date).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Insight Ribbon */}
      <div className="px-5 py-3 bg-surface-container-low/70 border-t border-surface-container-highest/60 flex flex-wrap items-center justify-between text-xs text-on-surface-variant gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-emerald-600">verified</span>
          <span>
            {activeTab === 'digital_twin'
              ? `Estimated EOL milestone: Cycle ${estimatedEolCycle || (currentCycle + 350)} (~${Math.max(1, Math.round(((estimatedEolCycle || currentCycle + 350) - currentCycle) * 4.5 / 365))} years remaining based on observed ${Math.abs(degradationSlope || 0.05).toFixed(3)} pp/cyc fade rate).`
              : activeTab === 'stress_scenarios'
              ? 'Real-world EV batteries retain >90% SOH past year 3 under standard AC/DC charging mix.'
              : 'Pack capacity decreases smoothly with cumulative cycling; regenerative braking and resting pauses cause minor physical rebound.'}
          </span>
        </div>
        <div className="text-[11px] font-mono text-on-surface-variant">
          Hover along curves to inspect exact cycle assessments
        </div>
      </div>
    </div>
  );
}

export default DigitalTwinHealthChart;
