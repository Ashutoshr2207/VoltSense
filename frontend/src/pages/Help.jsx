import React from 'react';

export default function Help() {
  const faqs = [
    {
      q: "How does VoltSense calculate State of Health (SOH)?",
      a: "VoltSense employs trained Scikit-Learn regression models (Random Forest and Gradient Boosting) trained on NASA's verified Li-ion battery aging dataset, paired with direct empirical capacity retention and discharge cycle timelines."
    },
    {
      q: "What telemetry file formats are supported?",
      a: "VoltSense accepts raw CAN DBC logs, standard CSVs, JSON arrays, and Parquet columnar files containing timestamp, pack voltage, current, cell-level min/max voltages, and battery module thermistor readings."
    },
    {
      q: "What does an 'Attention Required' status mean?",
      a: "A pack is flagged for attention if cell voltage delta exceeds 10mV during rest stabilization, or if the estimated degradation trajectory exhibits accelerated non-linear aging (knee-point fade)."
    },
    {
      q: "What is the EOL threshold for EV batteries?",
      a: "Industry standard End of Life (EOL) for automotive traction battery packs is set to 70.0% nominal remaining capacity, after which second-life stationary storage is recommended."
    }
  ];

  return (
    <div className="flex flex-col w-full pb-space-4xl max-w-4xl">
      <div className="flex flex-col gap-space-2xs mb-space-xl">
        <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-semibold">
          Documentation & Diagnostic Support
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          Help & Frequently Asked Questions
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Guidelines on telemetry log formatting, electrochemical degradation tracking, and ML model inference.
        </p>
      </div>

      <div className="flex flex-col gap-space-md">
        {faqs.map((faq, i) => (
          <div key={i} className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-2">
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">help_outline</span>
              {faq.q}
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant pl-7 leading-relaxed">
              {faq.a}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
