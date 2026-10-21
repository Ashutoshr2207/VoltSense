import React from 'react';

/**
 * Pure non-chart battery health indicator.
 * Displays battery State of Health with an elegant physical battery cell representation,
 * health status badge, and clear plain-language explanation without any line/curve graphs.
 */
export function BatteryHealthMeter({
  soh = 88.5,
  status = 'healthy',
  eolThreshold = 80,
  referenceCapacityAh = null,
  currentCapacityAh = null,
  lastAnalyzed = null,
}) {
  const safeSoh = Math.max(0, Math.min(100, Number(soh) || 0));

  // Determine theme colors based on documented thresholds
  const isHealthy = safeSoh >= 90;
  const isAttention = safeSoh >= 80 && safeSoh < 90;
  const isCritical = safeSoh < 80;

  const barColor = isHealthy ? 'bg-emerald-600' : isAttention ? 'bg-amber-500' : 'bg-rose-600';
  const badgeClasses = isHealthy 
    ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30' 
    : isAttention 
    ? 'bg-amber-500/10 text-amber-800 border-amber-500/30' 
    : 'bg-rose-500/10 text-rose-800 border-rose-500/30';
  const statusLabel = isHealthy ? 'Healthy Battery' : isAttention ? 'Monitor Degradation' : 'Attention Required';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant font-mono">State of Health</span>
          <div className="flex items-baseline gap-2.5 mt-0.5">
            <span className="text-4xl font-bold tracking-tight text-on-surface font-mono">
              {safeSoh.toFixed(1)}%
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClasses}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {lastAnalyzed && (
          <div className="text-right">
            <span className="text-xs text-on-surface-variant">Latest Assessment</span>
            <div className="text-xs font-medium text-on-surface font-mono">{lastAnalyzed}</div>
          </div>
        )}
      </div>

      {/* Physical Battery Pack Shape Indicator */}
      <div className="relative flex items-center gap-2 pt-1">
        <div className="flex-1 bg-surface-container-high/60 h-8 rounded-xl p-1 border border-surface-container-highest shadow-inner relative overflow-hidden flex items-center">
          <div
            className={`h-full rounded-lg transition-all duration-700 ease-out shadow-xs ${barColor}`}
            style={{ width: `${safeSoh}%` }}
          />
          {/* EOL 80% Threshold Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-900/40 border-r border-dashed border-white"
            style={{ left: `${eolThreshold}%` }}
            title={`End of Life Threshold (${eolThreshold}%)`}
          />
        </div>
        <div className="w-2.5 h-4 bg-slate-400 rounded-r-xs" />
      </div>

      <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-mono">
        <span>0% Critical</span>
        <span className="font-semibold text-on-surface">80% End-of-Life Level</span>
        <span>100% Factory Spec</span>
      </div>

      {/* Before / After Capacity Comparison when Available */}
      {referenceCapacityAh && currentCapacityAh && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-surface-container-highest/60 text-xs">
          <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-container-highest/40">
            <span className="text-[11px] text-on-surface-variant uppercase font-semibold">Reference Baseline</span>
            <div className="font-bold text-sm text-on-surface font-mono mt-0.5">{referenceCapacityAh.toFixed(2)} Ah</div>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-container-highest/40">
            <span className="text-[11px] text-on-surface-variant uppercase font-semibold">Current Retention</span>
            <div className="font-bold text-sm text-on-surface font-mono mt-0.5">{currentCapacityAh.toFixed(2)} Ah</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Plain-language timeline of past battery events and analyses.
 * Composed of discrete structured event cards instead of graphs.
 */
export function BatteryEventTimeline({ events = [] }) {
  if (!events || !events.length) {
    return (
      <div className="py-6 text-center text-xs text-on-surface-variant font-mono">
        No historical battery analyses recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {events.map((evt, idx) => (
        <div
          key={idx}
          className="p-3 rounded-xl border border-surface-container-highest/80 bg-surface-container-lowest hover:border-primary/40 transition-colors flex items-center justify-between shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center font-bold text-xs font-mono border border-primary-container/30">
              {evt.cycle ? `C${evt.cycle}` : `#${idx + 1}`}
            </div>
            <div>
              <div className="font-semibold text-xs text-on-surface">
                {evt.title || `Cycle Analysis`}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">
                {evt.measurementDate ? (
                  <span>
                    <strong className="text-on-surface font-mono">Measured: {evt.measurementDate}</strong>
                    {evt.uploadDate && evt.uploadDate !== evt.measurementDate ? ` (Uploaded: ${evt.uploadDate})` : ''}
                  </span>
                ) : (
                  <span>{evt.date || 'Recorded Session'}</span>
                )}
                {evt.capacity != null && !isNaN(Number(evt.capacity)) ? ` · ${Number(evt.capacity).toFixed(2)} Ah` : ''}
              </div>
            </div>
          </div>

          {evt.soh !== undefined && evt.soh !== null && (
            <div className="text-right">
              <span className="font-mono text-sm font-bold text-on-surface">
                {typeof evt.soh === 'number' ? evt.soh.toFixed(1) : evt.soh}%
              </span>
              <div className="text-[10px] text-on-surface-variant font-mono">State of Health</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
