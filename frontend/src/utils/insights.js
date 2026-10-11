import { has, fmt, tempLabel, healthLabel, trendSummary } from './battery';

const IMPACT_TONE = { Low: 'good', Moderate: 'warn', High: 'bad', 'Not enough data': 'neutral' };
export const impactTone = (i) => IMPACT_TONE[i] || 'neutral';

export function sohHistory(v) {
  return (v?.degradation?.historical || []).filter((p) => has(p.soh)).map((p) => ({ x: p.cycle, y: p.soh }));
}
export function capacityHistory(v) {
  return (v?.cycleTable || []).filter((c) => has(c.capacity)).map((c) => ({ x: c.cycle, y: c.capacity }));
}
export function tempHistory(v) {
  return (v?.cycleTable || []).filter((c) => has(c.meanTemperature)).map((c) => ({ x: c.cycle, y: c.meanTemperature }));
}
export function voltageHistory(v) {
  return (v?.cycleTable || []).filter((c) => has(c.meanVoltage)).map((c) => ({ x: c.cycle, y: c.meanVoltage }));
}
export function avgTemp(v) {
  const m = v?.telemetryStats?.temperature?.mean;
  if (has(m)) return m;
  const t = tempHistory(v);
  return t.length ? t.reduce((a, b) => a + b.y, 0) / t.length : null;
}

/** Factors: use model-provided factors when the ML service returns them; otherwise plain observations from the data. */
export function buildFactors(v) {
  if (!v?.hasAnalysis) return [];
  if (v.factors?.length) {
    return v.factors.map((f) => ({
      name: f.name || f.factor, impact: f.impact || 'Not enough data',
      condition: f.condition || '', explanation: f.explanation || f.description || '', source: 'model',
    }));
  }
  const out = [];
  const t = avgTemp(v);
  out.push(!has(t)
    ? { name: 'Temperature', impact: 'Not enough data', condition: '', explanation: 'No temperature readings were found in your data.' }
    : { name: 'Temperature', condition: `${fmt(t)}°C average`, impact: t >= 40 ? 'High' : t >= 35 ? 'Moderate' : 'Low',
        explanation: t >= 35 ? 'Recent operating temperatures were higher than the preferred range.' : 'Temperatures stayed in a comfortable range.' });
  const cyc = v.cycles;
  out.push(!has(cyc)
    ? { name: 'Battery cycling', impact: 'Not enough data', explanation: 'Cycle count is not available.' }
    : { name: 'Battery cycling', condition: `${fmt(cyc, 0)} cycles`, impact: cyc > 1000 ? 'High' : cyc > 400 ? 'Moderate' : 'Low',
        explanation: cyc > 400 ? 'The battery has completed many charge cycles, which naturally reduces capacity.' : 'The battery is still early in its cycle life.' });
  const ref = v.referenceCapacityAh, cur = v.currentCapacityAh;
  out.push(!has(ref) || !has(cur)
    ? { name: 'Capacity loss', impact: 'Not enough data', explanation: 'Capacity readings are not available.' }
    : (() => { const loss = ((ref - cur) / ref) * 100; return { name: 'Capacity loss', condition: `${fmt(loss)}% lost`, impact: loss > 20 ? 'High' : loss > 8 ? 'Moderate' : 'Low', explanation: 'How much usable capacity has been lost compared with the start of your data.' }; })());
  const tr = trendSummary(sohHistory(v).map((p) => ({ soh: p.y })));
  out.push(!tr
    ? { name: 'Recent trend', impact: 'Not enough data', explanation: 'More history is needed to describe the trend.' }
    : { name: 'Recent trend', condition: tr.key === 'stable' ? 'Stable' : tr.key === 'faster' ? 'Faster decline' : 'Gradual decline', impact: tr.key === 'faster' ? 'Moderate' : 'Low', explanation: tr.text });
  const cs = v.timeShare?.chargePercent;
  out.push(has(cs)
    ? { name: 'Charging behavior', condition: `${fmt(cs)}% of recorded time charging`, impact: 'Low', explanation: 'Share of your recorded time spent charging. Charging session details are not available from this file.' }
    : { name: 'Charging behavior', impact: 'Not enough data', explanation: 'Charging details are not available in this data.' });
  return out;
}

export function buildInsights(v) {
  const good = [], attention = [], recs = [];
  if (!v?.hasAnalysis) return { good, attention, recs, summary: null };
  const h = healthLabel(v.soh);
  const t = avgTemp(v);
  if (has(v.soh) && v.soh >= 90) good.push('Battery health is in the healthy range.');
  if (has(t) && t < 35) good.push(`Temperatures are comfortable (${fmt(t)}°C average).`);
  if (has(t) && t >= 35) { attention.push(`Operating temperature has been elevated (${fmt(t)}°C average).`); recs.push('Avoid parking in direct sun and prefer shaded or cooler places when charging.'); }
  if (has(v.soh) && v.soh < 80) { attention.push(`Battery health is ${fmt(v.soh)}%, which is below the healthy range.`); recs.push('Plan for reduced range and consider a battery check-up.'); }
  const tr = trendSummary(sohHistory(v).map((p) => ({ soh: p.y })));
  if (tr?.key === 'stable') good.push(tr.text);
  if (tr?.key === 'faster') { attention.push(tr.text); recs.push('Review recent charging and driving habits to slow the decline.'); }
  if (has(v.rul) && v.rul < 150) attention.push(`Only about ${fmt(v.rul, 0)} cycles remain before the end-of-life level.`);
  if (!has(v.rul)) attention.push('Remaining life could not be estimated yet. At least 7 valid battery cycles are required to generate a prediction.');
  recs.push('Keep daily charging between about 20% and 80% when you can.', 'Use fast charging only when needed.');
  (v.recommendations || []).forEach((r) => { const s = typeof r === 'string' ? r : r?.text; if (s && !recs.includes(s)) recs.push(s); });
  const summary = `${h.text}${has(v.soh) ? ` Battery health is ${fmt(v.soh)}%` : ''}${has(v.rul) ? ` with about ${fmt(v.rul, 0)} cycles of life remaining.` : '.'}`;
  return { good, attention, recs: recs.slice(0, 6), summary };
}
