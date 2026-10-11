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

  const barColor = isHealthy ? 'bg-[#24695b]' : isAttention ? 'bg-[#d9822b]' : 'bg-[#c73838]';
  const badgeBg = isHealthy ? 'bg-[#e7f3ef] text-[#24695b]' : isAttention ? 'bg-[#fdf3e7] text-[#a55f1a]' : 'bg-[#fae8e8] text-[#c73838]';
  const statusLabel = isHealthy ? 'Healthy Battery' : isAttention ? 'Monitor Degradation' : 'Attention Required';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#636b6f]">State of Health</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-4xl font-bold tracking-tight text-[#1c1e21] font-mono">
              {safeSoh.toFixed(1)}%
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeBg}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {lastAnalyzed && (
          <div className="text-right">
            <span className="text-xs text-[#636b6f]">Latest Assessment</span>
            <div className="text-xs font-medium text-[#1c1e21]">{lastAnalyzed}</div>
          </div>
        )}
      </div>

      {/* Physical Battery Pack Shape Indicator */}
      <div className="relative flex items-center gap-2 pt-1">
        {/* Terminal nipple */}
        <div className="flex-1 bg-[#ece9df] h-7 rounded-xl p-1 border border-[#dedad0] shadow-inner relative overflow-hidden flex items-center">
          <div
            className={`h-full rounded-lg transition-all duration-700 ease-out ${barColor}`}
            style={{ width: `${safeSoh}%` }}
          />
          {/* EOL 80% Threshold Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#1c1e21]/40 border-r border-dashed border-[#ffffff]"
            style={{ left: `${eolThreshold}%` }}
            title={`End of Life Threshold (${eolThreshold}%)`}
          />
        </div>
        <div className="w-2 h-3.5 bg-[#beb9ab] rounded-r-sm" />
      </div>

      <div className="flex items-center justify-between text-xs text-[#636b6f]">
        <span>0% Critical</span>
        <span className="font-medium text-[#1c1e21]">80% End-of-Life Target</span>
        <span>100% Brand New</span>
      </div>

      {/* Before / After Capacity Comparison when Available */}
      {referenceCapacityAh && currentCapacityAh && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#ece9df] text-xs">
          <div>
            <span className="text-[#636b6f]">Reference Capacity</span>
            <div className="font-semibold text-sm text-[#1c1e21] font-mono">{referenceCapacityAh.toFixed(2)} Ah</div>
          </div>
          <div>
            <span className="text-[#636b6f]">Current Usable Capacity</span>
            <div className="font-semibold text-sm text-[#1c1e21] font-mono">{currentCapacityAh.toFixed(2)} Ah</div>
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
      <div className="py-6 text-center text-sm text-[#71787e]">
        No historical battery analyses recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((evt, idx) => (
        <div
          key={idx}
          className="p-3.5 rounded-xl border border-[#dedad0] bg-[#ffffff] hover:border-[#24695b]/40 transition-colors flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#e7f3ef] text-[#24695b] flex items-center justify-center font-bold text-xs">
              {evt.cycle ? `C${evt.cycle}` : `#${idx + 1}`}
            </div>
            <div>
              <div className="font-semibold text-sm text-[#1c1e21]">
                {evt.title || `Cycle Analysis`}
              </div>
              <div className="text-xs text-[#71787e]">
                {evt.date || 'Recorded Session'} {evt.capacity ? `· ${evt.capacity.toFixed(2)} Ah` : ''}
              </div>
            </div>
          </div>

          {evt.soh !== undefined && (
            <div className="text-right">
              <span className="font-mono text-base font-bold text-[#1c1e21]">{evt.soh}%</span>
              <div className="text-[10px] text-[#71787e]">State of Health</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
