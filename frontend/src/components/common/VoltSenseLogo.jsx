import React from 'react';

export default function VoltSenseLogo({ className = "h-8 w-auto", showText = true }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg 
        viewBox="0 0 36 36" 
        className="h-8 w-8 flex-shrink-0" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Battery body */}
        <rect x="2" y="6" width="26" height="24" rx="4" stroke="#1a1c1f" strokeWidth="2.2" fill="#ffffff" />
        {/* Battery terminal */}
        <path d="M28 14C29.1046 14 30 14.8954 30 16V20C30 21.1046 29.1046 22 28 22" stroke="#1a1c1f" strokeWidth="2.2" strokeLinecap="round" />
        {/* Voltage waveform pulse */}
        <path d="M6 18L10 18L13 11L17 25L20 18L24 18" stroke="#19a974" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showText && (
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface leading-none font-bold">
            Volt<span className="text-primary-container">Sense</span>
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5 font-semibold">
            Diagnostics
          </span>
        </div>
      )}
    </div>
  );
}
