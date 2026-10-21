import React, { useState, useRef, useEffect } from 'react';
import { requestPredictionExplanation } from '../../api/predictionApi';
import { fmt, has } from '../../utils/battery';

/**
 * Intelligent deterministic answer generator when no prediction is available yet
 * or as a fallback for general battery engineering inquiries.
 */
function getGeneralBatteryAnswer(query, vehicle) {
  const q = query.toLowerCase();
  const soh = has(vehicle?.soh) ? `${fmt(vehicle.soh)}%` : null;
  const rul = has(vehicle?.rul) ? `${fmt(vehicle.rul, 0)} cycles` : null;

  if (q.includes('accuracy') || q.includes('model') || q.includes('algorithm')) {
    return "VoltSense uses an ensemble of Random Forest and Gradient Boosting regression models trained on multi-cycle lithium-ion laboratory aging data. The models predict State of Health (SOH) and estimate Remaining Useful Life (RUL) to an 80% End-of-Life capacity threshold.";
  }
  if (q.includes('extend') || q.includes('longevity') || q.includes('habit') || q.includes('preserve') || q.includes('care')) {
    return "To maximize battery longevity: (1) Maintain daily state of charge between 20% and 80%. (2) Avoid leaving the car parked at 100% in high ambient temperatures. (3) Rely on AC slow charging for daily needs and limit high-power DC fast charging to long road trips.";
  }
  if (q.includes('temperature') || q.includes('heat') || q.includes('cold') || q.includes('winter')) {
    return "Lithium-ion cells age fastest when cycled or stored at high temperatures (>35°C), which accelerates Solid Electrolyte Interphase (SEI) layer growth. In cold weather (<0°C), internal resistance increases temporarily, reducing driving range and charging speed to prevent lithium plating.";
  }
  if (q.includes('imbalance') || q.includes('spread') || q.includes('cell')) {
    return "Cell voltage imbalance occurs when individual series cells in the pack drift in capacity or internal resistance. A spread greater than 20–30 mV during resting stabilization suggests weaker cells. The BMS uses passive balancing resistors during top-of-charge to equalize cell voltages.";
  }
  if (q.includes('soh') || q.includes('health') || q.includes('meaning')) {
    if (soh) {
      return `Your current State of Health is evaluated at ${soh}. This means your battery pack retains about ${soh} of the usable electrical capacity it had when brand new.`;
    }
    return "State of Health (SOH) measures current usable battery capacity as a percentage of original factory capacity. An SOH of 100% means like-new; 80% is the recognized automotive industry End-of-Life (EOL) threshold.";
  }
  if (q.includes('rul') || q.includes('life') || q.includes('remain') || q.includes('how long')) {
    if (rul) {
      return `Based on your cycle history, the model estimates approximately ${rul} remaining until reaching the 80% capacity threshold. Under typical daily commute habits, this equates to roughly 3–5 years of service.`;
    }
    return "Remaining Useful Life (RUL) represents the estimated number of full discharge-charge cycles remaining before the pack reaches 80% of its original capacity. Uploading 7+ consecutive cycle records allows the model to project this trend.";
  }

  return "VoltSense AI analyzes battery pack voltage, current, cell balancing, and thermistor telemetry to track degradation. For the most tailored answer, upload a recent telemetry CSV on the SOH & RUL page.";
}

export default function BatteryChatbot({ vehicle, latestPredictionId, className = '' }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hello! I am your VoltSense Battery Assistant, powered by Groq AI. Ask me anything about your vehicle's health (${has(vehicle?.soh) ? `${fmt(vehicle.soh)}% SOH` : 'battery health'}), remaining lifespan, or charging practices.`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const q = (textToSend || input).trim();
    if (!q || loading) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      let replyText = '';
      if (latestPredictionId) {
        // Query backend Groq service with authoritative prediction context
        const res = await requestPredictionExplanation(latestPredictionId, q);
        if (res?.summary) {
          replyText = res.summary;
          if (res.sections?.meaning && !replyText.includes(res.sections.meaning)) {
            replyText += `\n\n${res.sections.meaning}`;
          }
          if (res.sections?.nextSteps && res.sections.nextSteps.length > 0) {
            replyText += `\n\nNext steps:\n• ` + res.sections.nextSteps.slice(0, 3).join('\n• ');
          }
        } else {
          replyText = getGeneralBatteryAnswer(q, vehicle);
        }
      } else {
        replyText = getGeneralBatteryAnswer(q, vehicle);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      // Graceful fallback
      const fallback = getGeneralBatteryAnswer(q, vehicle);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: fallback,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const PROMPT_CHIPS = [
    "Why is my battery health at this level?",
    "How many charge cycles do I have left?",
    "What daily charging habits extend lifespan?",
    "How does temperature affect my pack?",
    "What is cell voltage imbalance?",
  ];

  return (
    <div className={`flex flex-col bg-surface-container-lowest rounded-2xl border border-surface-container-highest/80 shadow-sm overflow-hidden ${className}`}>
      {/* Chatbot Header */}
      <div className="p-4 bg-surface-container-low border-b border-surface-container-highest/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-container/25 text-primary flex items-center justify-center border border-primary-container/40">
            <span className="material-symbols-outlined text-[20px]">smart_toy</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2">
              <span>VoltSense Battery AI</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                GROQ LLAMA-3.3
              </span>
            </h3>
            <p className="text-[11px] text-on-surface-variant font-mono">
              Natural-language electrochemical explanation engine
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMessages([messages[0]])}
          className="text-xs text-on-surface-variant hover:text-on-surface px-2.5 py-1 rounded-lg hover:bg-surface-container transition-colors"
          title="Reset conversation"
        >
          Clear
        </button>
      </div>

      {/* Suggested Chips Bar */}
      <div className="px-4 py-2.5 bg-surface-container-lowest border-b border-surface-container-highest/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] uppercase font-bold text-on-surface-variant shrink-0 mr-1">
          Suggestions:
        </span>
        {PROMPT_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(chip)}
            disabled={loading}
            className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-[11px] text-on-surface font-medium whitespace-nowrap transition-colors border border-surface-container-highest/80 cursor-pointer disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Messages Thread */}
      <div className="flex-1 p-4 space-y-3.5 overflow-y-auto max-h-[380px] min-h-[260px] bg-surface-container-lowest">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-primary text-on-primary rounded-br-xs shadow-2xs font-medium'
                  : 'bg-surface-container-low text-on-surface rounded-bl-xs border border-surface-container-highest/80'
              }`}
            >
              <div className="whitespace-pre-line">{m.text}</div>
            </div>
            <span className="text-[10px] text-on-surface-variant font-mono mt-1 px-1">
              {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-2xl w-fit border border-surface-container-highest/60">
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
            <span className="text-xs text-on-surface-variant font-mono ml-1">Consulting Groq AI...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-surface-container-low border-t border-surface-container-highest/80 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your battery, range, or charging..."
          disabled={loading}
          className="flex-1 h-10 px-3.5 rounded-xl bg-surface-container-lowest text-xs text-on-surface border border-surface-container-highest/80 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-on-surface-variant/60"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="h-10 px-4 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
        >
          <span>Send</span>
          <span className="material-symbols-outlined text-[16px]">send</span>
        </button>
      </form>
    </div>
  );
}
