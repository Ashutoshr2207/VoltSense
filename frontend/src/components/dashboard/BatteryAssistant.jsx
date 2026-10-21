import React, { useState } from 'react';
import { Card } from '../common/ui';
import { fmt, has, healthLabel, tempLabel, trendSummary } from '../../utils/battery';
import { buildInsights, sohHistory, avgTemp } from '../../utils/insights';
import { requestPredictionExplanation } from '../../api/predictionApi';
import { useApp } from '../../context/AppContext';

const QUESTIONS = [
  'Why is my battery health decreasing?',
  'What does my battery health mean?',
  'How much battery life do I have left?',
  'Why is temperature affecting my battery?',
  'How can I improve battery longevity?',
  'Explain my latest battery analysis.',
];

/** Fast deterministic fallback if Groq API is waiting or unconfigured */
function localAnswer(q, v) {
  const h = healthLabel(v?.soh), t = avgTemp(v), ins = buildInsights(v);
  const tr = trendSummary(sohHistory(v).map((p) => ({ soh: p.y })));
  switch (q) {
    case QUESTIONS[0]: return tr ? `${tr.text} All batteries lose capacity as they go through charge cycles${has(v?.cycles) ? `; yours has completed ${fmt(v.cycles, 0)}` : ''}. Heat and frequent fast charging can speed this up.` : 'There is not enough history yet to describe a trend.';
    case QUESTIONS[1]: return has(v?.soh) ? `${fmt(v.soh)}% means your battery can hold about ${fmt(v.soh, 0)}% of the energy it could when new. Status: ${h.label}.` : 'No battery health value is available yet.';
    case QUESTIONS[2]: return has(v?.rul) ? `About ${fmt(v.rul, 0)} charge cycles remain before the battery reaches the ${v.eolThreshold || 80}% end-of-life level.` : 'Remaining life is not available yet. It appears once the battery analysis service is connected.';
    case QUESTIONS[3]: return `High temperatures speed up chemical ageing.${has(t) ? ` Your average temperature was ${fmt(t)}°C (${tempLabel(t).label.toLowerCase()}).` : ' Your data has no temperature readings.'}`;
    case QUESTIONS[4]: return ins.recs.join(' ');
    default: return `${ins.summary || ''} ${ins.attention[0] || ''}`.trim();
  }
}

export default function BatteryAssistant({ vehicle }) {
  const { setCurrentTab } = useApp();
  const [q, setQ] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('local');

  if (!vehicle?.hasAnalysis) return null;

  const handleSelectQuestion = async (selectedQ) => {
    if (q === selectedQ) {
      setQ(null);
      setAnswerText('');
      return;
    }
    setQ(selectedQ);
    const local = localAnswer(selectedQ, vehicle);
    setAnswerText(local);
    setSource('local');

    if (vehicle.latestPredictionId) {
      setLoading(true);
      try {
        const exp = await requestPredictionExplanation(vehicle.latestPredictionId, selectedQ);
        if (exp?.summary) {
          let full = exp.summary;
          if (exp.sections?.meaning && !full.includes(exp.sections.meaning)) {
            full += ` ${exp.sections.meaning}`;
          }
          setAnswerText(full);
          setSource(exp.source === 'groq_ai' ? 'groq' : 'deterministic');
        }
      } catch {
        // Keeps local answer
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Card 
      title="Battery Intelligence Advisory" 
      subtitle="Contextual explanations powered by Groq Llama 3.3 and verified ML evidence."
      action={
        <button
          type="button"
          onClick={() => setCurrentTab('insights')}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Open Chatbot</span>
          <span className="material-symbols-outlined text-[16px]">chat</span>
        </button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {QUESTIONS.map((x) => (
          <button 
            key={x} 
            onClick={() => handleSelectQuestion(x)} 
            aria-pressed={q === x}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-all cursor-pointer border ${
              q === x 
                ? 'bg-primary text-on-primary border-primary shadow-xs' 
                : 'bg-surface-container border-surface-container-highest/80 text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {x}
          </button>
        ))}
      </div>

      {q && (
        <div className="mt-3.5 text-xs leading-relaxed bg-surface-container-low rounded-xl p-3.5 border border-surface-container-highest/60 flex flex-col gap-2 animate-in fade-in" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-primary flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${source === 'groq' ? 'bg-emerald-500 animate-pulse' : 'bg-primary'}`} />
              {source === 'groq' ? 'Groq Llama-3.3' : 'Verified Rule Model'}
            </span>
            {loading && <span className="text-[10px] text-on-surface-variant font-mono">Refining with Groq...</span>}
          </div>
          <p className="text-on-surface whitespace-pre-line">{answerText}</p>
        </div>
      )}
    </Card>
  );
}
