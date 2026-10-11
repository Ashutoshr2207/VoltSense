import React from 'react';
import { toneClasses } from '../../utils/battery';

export const Card = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`bg-surface-container-lowest rounded-xl border border-surface-container-highest/60 p-space-xl ${className}`}>
    {(title || action) && (
      <div className="flex items-start justify-between gap-3 mb-space-base">
        <div>
          {title && <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>}
          {subtitle && <p className="text-body-sm text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const Badge = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-body-sm font-medium ${toneClasses[tone]}`}>
    <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />{children}
  </span>
);

export const Skeleton = ({ className = 'h-24' }) => <div className={`animate-pulse bg-surface-container rounded-xl ${className}`} aria-hidden="true" />;

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-space-2xl">
    <div>
      <h1 className="text-headline-lg-mobile md:text-headline-lg text-on-surface">{title}</h1>
      {subtitle && <p className="text-body-lg text-on-surface-variant mt-1">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Btn = ({ children, variant = 'primary', className = '', ...p }) => (
  <button {...p} className={`inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg text-body-md font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 transition-colors ${
    variant === 'primary' ? 'bg-primary text-on-primary hover:bg-surface-tint' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'} ${className}`}>{children}</button>
);

export const EmptyState = ({ icon = 'inbox', title, text, actionLabel, onAction }) => (
  <div className="text-center py-space-4xl px-space-base">
    <span className="material-symbols-outlined text-[40px] text-outline" aria-hidden="true">{icon}</span>
    <h3 className="text-headline-sm mt-2 text-on-surface">{title}</h3>
    {text && <p className="text-body-md text-on-surface-variant mt-1 max-w-md mx-auto">{text}</p>}
    {actionLabel && <Btn className="mt-space-base" onClick={onAction}>{actionLabel}</Btn>}
  </div>
);

export const ErrorState = ({ text = 'Unable to connect to VoltSense right now. Please try again.', onRetry }) => (
  <div role="alert" className="flex items-center justify-between gap-3 bg-error-container/50 text-on-error-container rounded-xl p-space-base">
    <span className="text-body-md">{text}</span>
    {onRetry && <Btn variant="secondary" onClick={onRetry}>Try again</Btn>}
  </div>
);

export const Metric = ({ label, value, unit, note, tone, loading }) => (
  <div className="bg-surface-container-lowest rounded-xl border border-surface-container-highest/60 p-space-base">
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      {tone && <span className={`w-2 h-2 rounded-full ${tone === 'good' ? 'bg-primary-container' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-error' : 'bg-outline-variant'}`} aria-hidden="true" />}
    </div>
    {loading ? <Skeleton className="h-8 mt-2" /> : (
      <div className="mt-1 text-[28px] leading-tight font-semibold text-on-surface">
        {value ?? <span className="text-on-surface-variant text-lg font-normal">Not available</span>}
        {value != null && unit && <span className="text-body-md text-on-surface-variant font-normal ml-1">{unit}</span>}
      </div>
    )}
    {note && <p className="text-body-sm text-on-surface-variant mt-1">{note}</p>}
  </div>
);

export const Explain = ({ summary, children }) => (
  <details className="mt-space-sm text-body-sm text-on-surface-variant">
    <summary className="cursor-pointer text-primary font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">{summary}</summary>
    <div className="mt-1 leading-relaxed">{children}</div>
  </details>
);
