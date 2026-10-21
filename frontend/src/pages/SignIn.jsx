import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import VoltSenseLogo from '../components/common/VoltSenseLogo';

export default function SignIn({ initialMode = 'signin' }) {
  const { login, loginDemo, register, setCurrentTab, currentTab } = useApp();
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

  const handleDemoAutofill = async () => {
    setMode('signin');
    setErrorMessage('');
    try {
      await loginDemo();
    } catch (err) {
      setErrorMessage(err?.message || 'Could not open the demo account. Check that the backend and MongoDB are running.');
    }
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
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-surface-container mb-1 border border-surface-container-highest/80 shadow-xs">
                <VoltSenseLogo className="h-8 w-auto" showText={false} />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-primary font-mono font-semibold uppercase tracking-wider bg-primary-container/15 border border-primary-container/30 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                EV Battery Intelligence Platform
              </div>
              <h1 className="text-headline-md text-on-surface font-bold tracking-tight mt-1">
                {mode === 'register' ? 'Create EV Engineer Account' : 'Sign In to VoltSense'}
              </h1>
              <p className="text-body-sm text-on-surface-variant max-w-[360px] leading-relaxed">
                {mode === 'register'
                  ? 'Register to monitor battery degradation trends, cell health, and remaining useful life.'
                  : 'Access real-time battery analytics, telemetry ingestion, and empirical SOH evaluations.'}
              </p>
            </div>

            {/* Mode Toggle Tabs */}
            <div className="grid grid-cols-2 p-1 bg-surface-container rounded-xl border border-surface-container-highest/80">
              <button
                type="button"
                onClick={() => { setMode('signin'); setErrorMessage(''); }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setErrorMessage(''); }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Quick Fill Demo Preset */}
            {mode === 'signin' && (
              <button 
                type="button"
                onClick={handleDemoAutofill}
                className="w-full text-left bg-surface-container-low hover:bg-surface-container transition-all rounded-xl p-3.5 flex items-center justify-between group cursor-pointer border border-surface-container-highest/80 hover:border-primary/40 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-container-lowest text-primary border border-surface-container-highest/60 shadow-2xs">
                    <span className="material-symbols-outlined text-[20px]">bolt</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold font-mono">
                      Fast-Track Demo Operator
                    </span>
                    <span className="text-xs text-on-surface font-mono font-medium">
                      One-click evaluation session
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-primary text-xs font-semibold group-hover:translate-x-0.5 transition-transform">
                  <span>Sign In</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
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
                      className="w-full h-10 pl-10 pr-space-md bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all border border-surface-container-highest/90"
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
                    className="w-full h-10 pl-10 pr-space-md bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all border border-surface-container-highest/90"
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
                      className="font-label-sm text-[11px] text-primary hover:underline cursor-pointer"
                    >
                      Open Demo Account
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
                    className="w-full h-10 pl-10 pr-10 bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all border border-surface-container-highest/90"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-space-md text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
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
                      className="w-full h-10 pl-10 pr-space-md bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all border border-surface-container-highest/90"
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {errorMessage && (
                <div className="px-space-md py-space-sm rounded-lg bg-error-container/30 border border-error-container text-error font-body-sm text-body-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit */}
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 mt-1 rounded-lg bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
