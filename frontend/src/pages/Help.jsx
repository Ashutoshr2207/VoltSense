import React, { useState } from 'react';
import { Card, PageHeader, Btn } from '../components/common/ui';
import { useApp } from '../context/AppContext';

export default function Help() {
  const { setCurrentTab } = useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const faqs = [
    {
      cat: 'health',
      q: "How does VoltSense calculate State of Health (SOH)?",
      a: "VoltSense compares how much usable energy your battery holds now compared to when it was brand new (empirical capacity retention ratio), and couples this with trained machine learning models (Random Forest & Gradient Boosting) to project remaining life."
    },
    {
      cat: 'health',
      q: "What do the Speedometer and Health Meter colors (Green, Yellow, Red) mean?",
      a: "In the Battery Speedometer, Green (80%–100%, or at/above your configured EOL threshold) indicates good condition with prime capacity; Yellow (70%–79%) indicates fine condition with moderate fade; Red (<70%) indicates critical degradation. In the Health Meter, Green (≥90%) represents optimal health, Amber (80%–89%) indicates normal aging to monitor, and Red (<80%) flags capacity below the end-of-life threshold."
    },
    {
      cat: 'telemetry',
      q: "What telemetry CSV file formats are supported?",
      a: "VoltSense accepts CSV files with timestamp, cycle index, pack voltage, current, cell-level min/max voltages, and battery module thermistor readings. The platform processes telemetry with automatic schema validation and anomaly screening."
    },
    {
      cat: 'anomalies',
      q: "What does an 'Attention Required' status mean?",
      a: "A pack is flagged for attention if cell voltage spread exceeds allowable limits during rest stabilization (>20–30 mV), if temperatures exceed safety thresholds (>35°C), or if the estimated degradation trajectory exhibits accelerated capacity fade."
    },
    {
      cat: 'charging',
      q: "What are the best charging practices for lithium-ion batteries?",
      a: "For daily commutes, keep the State of Charge between 20% and 80%. Prefer AC slow charging over DC fast charging to limit thermal stress. Avoid leaving the battery at 100% in hot parking lots."
    },
    {
      cat: 'health',
      q: "What is the EOL threshold for EV batteries?",
      a: "The automotive industry standard End of Life (EOL) for traction battery packs is set at 80% of original nominal capacity. VoltSense benchmarks Remaining Useful Life (RUL) against this 80% threshold."
    },
    {
      cat: 'telemetry',
      q: "Where can I get sample CSV datasets to test?",
      a: "Sample battery telemetry datasets for simulated EV owners are pre-loaded in the sample_data folder. You can upload any of these on the SOH & RUL page to preview instant analysis."
    }
  ];

  const filteredFaqs = faqs.filter((f) => {
    const matchCat = category === 'all' || f.cat === category;
    const matchSearch = !search || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col w-full pb-space-4xl max-w-4xl space-y-space-xl">
      <PageHeader
        title="Help & Knowledge Base"
        subtitle="Frequently asked questions about battery health, charging advice, telemetry formats, and machine learning."
      />

      {/* Search and Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FAQs and guides..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container-low text-xs text-on-surface border border-surface-container-highest/80 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'health', label: 'Battery Health' },
            { id: 'charging', label: 'Charging' },
            { id: 'telemetry', label: 'CSV Telemetry' },
            { id: 'anomalies', label: 'Anomalies' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                category === c.id
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* FAQs List */}
      <div className="flex flex-col gap-space-md">
        {filteredFaqs.map((faq, i) => (
          <Card key={i}>
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-body-lg text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">help_outline</span>
                {faq.q}
              </h3>
              <p className="font-body-md text-on-surface-variant pl-7 leading-relaxed">
                {faq.a}
              </p>
            </div>
          </Card>
        ))}

        {filteredFaqs.length === 0 && (
          <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-surface-container-highest/60">
            <p className="text-sm text-on-surface-variant">No matching questions found.</p>
          </div>
        )}
      </div>

      {/* Groq AI Chatbot Promotion Banner */}
      <div className="p-5 rounded-2xl bg-primary/10 border border-primary/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">smart_toy</span>
          </div>
          <div>
            <h4 className="font-bold text-sm text-on-surface">Need real-time explanations for your vehicle?</h4>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Ask our conversational AI assistant powered by Groq Llama 3.3 for plain-language diagnostics.
            </p>
          </div>
        </div>

        <Btn
          size="sm"
          onClick={() => setCurrentTab('insights')}
          className="shrink-0 flex items-center gap-1.5"
        >
          <span>Ask AI Chatbot</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Btn>
      </div>
    </div>
  );
}
