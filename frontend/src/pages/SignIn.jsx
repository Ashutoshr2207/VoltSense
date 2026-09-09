import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import VoltSenseLogo from '../components/common/VoltSenseLogo';

export default function SignIn() {
  const { login, setCurrentTab } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const handleDemoAutofill = () => {
    setEmail('reed.parmar@voltsense.io');
    setPassword('••••••••••••');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) return;
    login(email);
  };

  return (
    <div className="min-h-screen bg-background font-body-md text-on-surface flex flex-col justify-between antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* Top Bar */}
      <header className="w-full max-w-[1600px] mx-auto px-margin-mobile lg:px-margin-desktop py-space-xl flex items-center justify-between">
        <button 
          onClick={() => setCurrentTab('dashboard')} 
          className="flex items-center gap-space-sm group focus:outline-none"
        >
          <VoltSenseLogo className="h-8 w-auto" />
        </button>
        <button 
          onClick={() => setCurrentTab('dashboard')}
          className="inline-flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to dashboard
        </button>
      </header>

      {/* Main Form Center */}
      <main className="flex-1 flex items-center justify-center px-margin-mobile py-space-2xl">
        <div className="w-full max-w-[480px] mx-auto my-auto py-space-xl flex flex-col gap-space-xl">
          <div className="bg-surface-container-lowest shadow-md rounded-2xl p-space-xl md:p-space-2xl flex flex-col gap-space-xl border border-surface-container-highest/60">
            {/* Header */}
            <div className="flex flex-col items-center text-center gap-space-sm">
              <div className="inline-flex items-center justify-center p-space-xs rounded-xl bg-surface-container-low mb-space-2xs">
                <VoltSenseLogo className="h-8 w-auto" showText={false} />
              </div>
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-primary uppercase tracking-wider bg-secondary-container/20 px-space-sm py-space-2xs rounded-full">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                Industrial Telemetry Gateway
              </div>
              <h1 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                Sign in to your dashboard
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[360px]">
                Welcome back — access real-time cell impedance, degradation vectors, and fleet health indices.
              </p>
            </div>

            {/* Quick Fill Demo Diagnostic Box */}
            <button 
              type="button"
              onClick={handleDemoAutofill}
              className="w-full text-left bg-surface-container-low hover:bg-surface-container transition-colors rounded-xl p-space-md flex items-center justify-between group cursor-pointer border border-surface-container-highest/60"
            >
              <div className="flex items-start gap-space-sm">
                <div className="mt-0.5 p-space-xs rounded-lg bg-surface-container-lowest text-primary shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">terminal</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                    Telemetry Sandbox Preset
                  </span>
                  <span className="font-telemetry-sm text-telemetry-sm text-on-surface font-mono font-medium">
                    reed.parmar@voltsense.io
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-2xs text-primary font-label-sm text-label-sm font-semibold">
                <span>Auto-fill</span>
                <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                  east
                </span>
              </div>
            </button>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-space-lg">
              {/* Email */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="email-input">
                    Work Email Address
                  </label>
                  <span className="font-label-sm text-[11px] text-on-surface-variant">Fleet / Operator ID</span>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[18px] pointer-events-none">
                    alternate_email
                  </span>
                  <input 
                    id="email-input"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="engineer@fleet.com"
                    className="w-full h-10 pl-10 pr-space-md bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-surface-container-highest/40"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="password-input">
                    Authentication Key
                  </label>
                  <a href="#reset" onClick={e => { e.preventDefault(); alert("Use the Auto-fill preset button to log in."); }} className="font-label-sm text-[11px] text-primary hover:underline">
                    Reset Token?
                  </a>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[18px] pointer-events-none">
                    key
                  </span>
                  <input 
                    id="password-input"
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-10 pl-10 pr-space-md bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-surface-container-highest/40"
                  />
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-body-sm text-on-surface">
                  <input 
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="accent-primary rounded"
                  />
                  <span>Keep session active</span>
                </label>
                <span className="text-[11px] text-on-surface-variant font-mono">14 days token</span>
              </div>

              {/* Submit */}
              <button 
                type="submit"
                className="w-full h-11 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold transition-all shadow flex items-center justify-center gap-2"
              >
                <span>Authorize & Connect Gateway</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-[1600px] mx-auto px-margin-mobile lg:px-margin-desktop py-space-md flex flex-col sm:flex-row items-center justify-between text-[11px] text-on-surface-variant border-t border-surface-container-highest/40 gap-2">
        <span>© 2026 VoltSense Diagnostics Platform. All rights reserved.</span>
        <div className="flex items-center gap-space-md font-mono">
          <span>AES-256 GCM</span>
          <span>•</span>
          <span>ISO-26262 ASIL-D</span>
          <span>•</span>
          <span>CAN 2.0B / UDS</span>
        </div>
      </footer>
    </div>
  );
}
