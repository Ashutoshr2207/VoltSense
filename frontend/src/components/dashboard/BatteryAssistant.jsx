import React, { useState } from 'react';
import { Card } from '../common/ui';
import { fmt, has, healthLabel, tempLabel, trendSummary } from '../../utils/battery';
import { buildInsights, sohHistory, avgTemp } from '../../utils/insights';

const QUESTIONS = [
  'Why is my battery health decreasing?',
  'What does my battery health mean?',
  'How much battery life do I have left?',
  'Why is temperature affecting my battery?',
  'How can I improve battery longevity?',
  'Explain my latest battery analysis.',
];

/** Answers are assembled from the user's own analysis values. No numbers are generated or estimated here. */
function answer(q, v) {
  const h = healthLabel(v.soh), t = avgTemp(v), ins = buildInsights(v);
  const tr = trendSummary(sohHistory(v).map((p) => ({ soh: p.y })));
  switch (q) {
    case QUESTIONS[0]: return tr ? `${tr.text} All batteries lose capacity as they go through charge cycles${has(v.cycles) ? `; yours has completed ${fmt(v.cycles, 0)}` : ''}. Heat and frequent fast charging can speed this up.` : 'There is not enough history yet to describe a trend.';
    case QUESTIONS[1]: return has(v.soh) ? `${fmt(v.soh)}% means your battery can hold about ${fmt(v.soh, 0)}% of the energy it could when new. Status: ${h.label}.` : 'No battery health value is available yet.';
    case QUESTIONS[2]: return has(v.rul) ? `About ${fmt(v.rul, 0)} charge cycles remain before the battery reaches the ${v.eolThreshold}% end-of-life level.` : 'Remaining life is not available yet. It appears once the battery analysis service is connected.';
    case QUESTIONS[3]: return `High temperatures speed up the chemical ageing inside a battery.${has(t) ? ` Your average temperature was ${fmt(t)}°C (${tempLabel(t).label.toLowerCase()}).` : ' Your data has no temperature readings.'}`;
    case QUESTIONS[4]: return ins.recs.join(' ');
    default: return `${ins.summary || ''} ${ins.attention[0] || ''}`.trim();
  }
}

export default function BatteryAssistant({ vehicle }) {
  const [q, setQ] = useState(null);
  if (!vehicle?.hasAnalysis) return null;
  return (
    <Card title="Ask about your battery" subtitle="Answers are based on your own battery data.">
      <div className="flex flex-wrap gap-2">{QUESTIONS.map((x) => (
        <button key={x} onClick={() => setQ(x)} aria-pressed={q === x}
          className={`px-3 py-2 rounded-lg text-body-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${q === x ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high'}`}>{x}</button>))}</div>
      {q && <p className="mt-space-base text-body-md bg-surface-container-low rounded-xl p-space-base" aria-live="polite">{answer(q, vehicle)}</p>}
    </Card>
  );
}
