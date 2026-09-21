import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import VoltSenseLogo from '../components/common/VoltSenseLogo';

export default function SignIn({ initialMode = 'signin' }) {
  const { login, register, setCurrentTab, currentTab } = useApp();
  const [mode, setMode] = useState(initialMode || (currentTab === 'register' ? 'register' : 'signin'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (currentTab === 'register') {
      setMode('register');
    } else if (currentTab === 'signin') {
      setMode('signin');
    }
  }, [currentTab]);

  const handleDemoAutofill = () => {
    setMode('signin');
    setEmail('reed.parmar@voltsense.io');
    setPassword('VoltSense#2026');
    setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (mode === 'register') {
      if (!name.trim()) {
        setErrorMessage('Please enter your name.');
        return;
      }
      if (!email.trim() || !password) {
        setErrorMessage('Email and password are required.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }

      setIsSubmitting(true);
      try {
        await register(name.trim(), email.trim(), password);
      } catch (error) {
        setErrorMessage(error.message || 'Registration failed. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!email || !password) {
        setErrorMessage('Please enter both email and password.');
        return;
      }
      setIsSubmitting(true);
      try {
        await login(email, password);
      } catch (error) {
        setErrorMessage(error.message || 'Login failed. Check your credentials and try again.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background font-body-md text-on-surface flex flex-col justify-between antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* Top Bar */}
      <header className="w-full max-w-[1600px] mx-auto px-margin-mobile lg:px-margin-desktop py-space-xl flex items-center justify-between">
        <button 
          onClick={() => setCurrentTab('landing')} 
          className="flex items-center gap-space-sm group focus:outline-none cursor-pointer"
        >
          <VoltSenseLogo className="h-8 w-auto" />
        </button>
        <button 
          onClick={() => setCurrentTab('landing')}
          className="inline-flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Home
        </button>
      </header>

      {/* Main Form Center */}
      <main className="flex-1 flex items-center justify-center px-margin-mobile py-space-xl">
        <div className="w-full max-w-[480px] mx-auto my-auto flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest shadow-md rounded-2xl p-space-xl md:p-space-2xl flex flex-col gap-space-lg border border-surface-container-highest/60">
            {/* Header */}
            <div className="flex flex-col items-center text-center gap-space-xs">
              <div className="inline-flex items-center justify-center p-space-xs rounded-xl bg-surface-container-low mb-space-2xs">
                <VoltSenseLogo className="h-8 w-auto" showText={false} />
              </div>
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-primary uppercase tracking-wider bg-secondary-container/20 px-space-sm py-space-2xs rounded-full">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                EV Diagnostics & Battery Health
              </div>
              <h1 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                {mode === 'register' ? 'Create your EV account' : 'Sign in to your EV dashboard'}
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[360px]">
                {mode === 'register'
                  ? 'Set up your account to start monitoring battery health, degradation trends, and range.'
                  : 'Welcome back — access battery health indices, remaining useful life, and smart charging.'}
              </p>
            </div>

            {/* Mode Toggle Tabs */}
            <div className="grid grid-cols-2 p-1 bg-surface-container-low rounded-xl border border-surface-container-highest/60">
              <button
                type="button"
                onClick={() => { setMode('signin'); setErrorMessage(''); }}
                className={`py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setErrorMessage(''); }}
                className={`py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Quick Fill Demo Preset for Reed Parmar */}
            {mode === 'signin' && (
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
                      Demo Account Preset (Reed Parmar)
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
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-space-md">
              {/* Name (Only in Register mode) */}
              {mode === 'register' && (
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="name-input">
                    Full Name
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[18px] pointer-events-none">
                      person
                    </span>
                    <input 
                      id="name-input"
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      className="w-full h-10 pl-10 pr-space-md bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-surface-container-highest/40"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="flex flex-col gap-space-xs">
                <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="email-input">
                  Email Address
                </label>
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
                    placeholder="you@example.com"
                    className="w-full h-10 pl-10 pr-space-md bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-surface-container-highest/40"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="password-input">
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button 
                      type="button"
                      onClick={handleDemoAutofill} 
                      className="font-label-sm text-[11px] text-primary hover:underline"
                    >
                      Use Demo Password?
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[18px] pointer-events-none">
                    lock
                  </span>
                  <input 
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-10 pl-10 pr-10 bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-surface-container-highest/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-space-md text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
                {mode === 'register' && (
                  <span className="font-label-sm text-[11px] text-on-surface-variant">
                    Minimum 6 characters
                  </span>
                )}
              </div>

              {/* Confirm Password (Register only) */}
              {mode === 'register' && (
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="confirm-password-input">
                    Confirm Password
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[18px] pointer-events-none">
                      lock_reset
                    </span>
                    <input 
                      id="confirm-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-10 pl-10 pr-space-md bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-surface-container-highest/40"
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {errorMessage && (
                <div className="px-space-md py-space-sm rounded-lg bg-error-container/30 border border-error-container text-error font-body-sm text-body-sm">
                  {errorMessage}
                </div>
              )}

              {/* Submit */}
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 mt-1 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold transition-all shadow flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>
                  {isSubmitting
                    ? (mode === 'register' ? 'Creating Account…' : 'Signing In…')
                    : (mode === 'register' ? 'Create Account & Get Started' : 'Sign In')}
                </span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </form>

            {/* Footer switcher */}
            <div className="text-center pt-1 border-t border-surface-container-highest/40 text-sm text-on-surface-variant">
              {mode === 'signin' ? (
                <p>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setErrorMessage(''); }}
                    className="text-primary font-semibold hover:underline cursor-pointer"
                  >
                    Register free
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setErrorMessage(''); }}
                    className="text-primary font-semibold hover:underline cursor-pointer"
                  >
                    Sign in here
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-[1600px] mx-auto px-margin-mobile lg:px-margin-desktop py-space-md flex flex-col sm:flex-row items-center justify-between text-[11px] text-on-surface-variant border-t border-surface-container-highest/40 gap-2">
        <span>© 2026 VoltSense Diagnostics Platform. All rights reserved.</span>
        <div className="flex items-center gap-space-md font-mono">
          <span>Personal EV Diagnostics</span>
          <span>•</span>
          <span>BMS Telemetry Ingestion</span>
          <span>•</span>
          <span>ML Degradation Analytics</span>
        </div>
      </footer>
    </div>
  );
}
