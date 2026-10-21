import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import BatteryChatbot from './BatteryChatbot';

/**
 * FloatingChatbot
 * Fixed bottom-right AI Assistant widget featuring a bot figure.
 * Provides accessible Groq-powered natural-language battery intelligence from any screen.
 */
export default function FloatingChatbot() {
  const { activeVehicle } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Expanded Chatbot Window */}
      {isOpen && (
        <div className="mb-4 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-7rem)] shadow-2xl rounded-2xl border border-surface-container-highest bg-surface-container-lowest flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-surface-container-low border-b border-surface-container-highest/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[19px]">smart_toy</span>
              </div>
              <div>
                <h4 className="font-semibold text-xs text-on-surface flex items-center gap-1.5">
                  <span>VoltSense AI</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </h4>
                <p className="text-[10px] text-on-surface-variant font-mono">
                  Groq Llama 3.3 Engine
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              aria-label="Minimize AI Assistant"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Embedded BatteryChatbot */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <BatteryChatbot
              vehicle={activeVehicle}
              latestPredictionId={activeVehicle?.latestPredictionId}
              className="h-full border-none rounded-none shadow-none"
            />
          </div>
        </div>
      )}

      {/* Floating Bot Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-full shadow-lg transition-all duration-300 cursor-pointer ${
          isOpen
            ? 'bg-slate-800 text-white dark:bg-slate-700'
            : 'bg-primary text-on-primary hover:scale-105 hover:shadow-xl hover:shadow-primary/25'
        }`}
        aria-label={isOpen ? 'Close AI Battery Assistant' : 'Open AI Battery Assistant'}
      >
        {/* Animated Green Pulse Indicator */}
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900"></span>
        </span>

        {/* Bot Figure Icon */}
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-[22px]">
            {isOpen ? 'keyboard_arrow_down' : 'smart_toy'}
          </span>
        </div>

        {/* Label */}
        <span className="text-xs font-bold tracking-wide pr-1 select-none">
          {isOpen ? 'Close Assistant' : 'Ask Battery AI'}
        </span>
      </button>
    </div>
  );
}
