import React from 'react';
import { toneClasses } from '../../utils/battery';

export const Card = ({ title, subtitle, action, badge, children, className = '' }) => (
  <section className={`bg-surface-container-lowest rounded-xl border border-surface-container-highest/80 shadow-sm p-space-xl transition-shadow ${className}`}>
    {(title || action || badge) && (
      <div className="flex flex-wrap items-start justify-between gap-3 mb-space-base pb-space-sm border-b border-surface-container-highest/40">
        <div>
          <div className="flex items-center gap-2">
            {title && <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>}
            {badge}
          </div>
          {subtitle && <p className="text-body-sm text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    )}
    {children}
  </section>
);

export const Badge = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-body-sm font-medium border ${toneClasses[tone] || toneClasses.neutral} ${className}`}>
    <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </span>
);

export const Skeleton = ({ className = 'h-24' }) => (
  <div className={`animate-pulse bg-surface-container-high/60 rounded-xl ${className}`} aria-hidden="true" />
);

export const PageHeader = ({ title, subtitle, action, tag }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-space-2xl">
    <div>
      {tag && (
        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-1.5">
          {tag}
        </div>
      )}
      <h1 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface tracking-tight">{title}</h1>
      {subtitle && <p className="text-body-lg text-on-surface-variant mt-1 max-w-2xl">{subtitle}</p>}
    </div>
    {action && <div className="flex items-center gap-2">{action}</div>}
  </div>
);

export const Btn = ({ children, variant = 'primary', size = 'md', className = '', ...p }) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer rounded-lg';
  const sizeClasses = size === 'sm' ? 'px-3 h-8 text-xs' : 'px-4 h-10 text-body-md';
  const variantClasses = {
    primary: 'bg-primary text-on-primary hover:bg-surface-tint shadow-sm active:translate-y-px',
    secondary: 'bg-surface-container text-on-surface hover:bg-surface-container-high border border-surface-container-highest/60',
    outline: 'bg-transparent text-on-surface hover:bg-surface-container-low border border-surface-container-highest',
    danger: 'bg-error text-on-error hover:bg-red-700 shadow-sm',
    ghost: 'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low',
  };
  return (
    <button {...p} className={`${base} ${sizeClasses} ${variantClasses[variant] || variantClasses.primary} ${className}`}>
      {children}
    </button>
  );
};

export const EmptyState = ({ icon = 'inbox', title, text, actionLabel, onAction }) => (
  <div className="text-center py-space-4xl px-space-base flex flex-col items-center justify-center">
    <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-outline mb-3 shadow-inner">
      <span className="material-symbols-outlined text-[32px]" aria-hidden="true">{icon}</span>
    </div>
    <h3 className="text-headline-sm font-semibold text-on-surface">{title}</h3>
    {text && <p className="text-body-md text-on-surface-variant mt-1.5 max-w-md mx-auto leading-relaxed">{text}</p>}
    {actionLabel && <Btn className="mt-space-lg" onClick={onAction}>{actionLabel}</Btn>}
  </div>
);

export const ErrorState = ({ text = 'Unable to connect to VoltSense right now. Please try again.', onRetry }) => (
  <div role="alert" className="flex items-center justify-between gap-3 bg-error-container/40 border border-error-container text-on-error-container rounded-xl p-space-base">
    <div className="flex items-center gap-2.5">
      <span className="material-symbols-outlined text-error text-[20px]" aria-hidden="true">error</span>
      <span className="text-body-md font-medium">{text}</span>
    </div>
    {onRetry && <Btn variant="secondary" size="sm" onClick={onRetry}>Try again</Btn>}
  </div>
);

export const Metric = ({ label, value, unit, note, tone, loading, source }) => (
  <div className="bg-surface-container-lowest rounded-xl border border-surface-container-highest/80 shadow-sm p-space-base flex flex-col justify-between">
    <div className="flex items-center justify-between gap-2">
      <span className="text-body-sm font-medium text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-1.5">
        {source && (
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-semibold">
            {source}
          </span>
        )}
        {tone && (
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            tone === 'good' || tone === 'healthy' ? 'bg-primary-container' :
            tone === 'warn' || tone === 'attention' ? 'bg-amber-500' :
            tone === 'bad' || tone === 'critical' ? 'bg-error' : 'bg-outline-variant'
          }`} aria-hidden="true" />
        )}
      </div>
    </div>
    {loading ? <Skeleton className="h-8 mt-2" /> : (
      <div className="mt-1.5 text-[28px] leading-tight font-bold font-mono text-on-surface">
        {value ?? <span className="text-on-surface-variant text-base font-normal font-sans">Not available</span>}
        {value != null && unit && <span className="text-body-md text-on-surface-variant font-normal ml-1 font-sans">{unit}</span>}
      </div>
    )}
    {note && <p className="text-body-sm text-on-surface-variant mt-1.5">{note}</p>}
  </div>
);

export const Explain = ({ summary, children }) => (
  <details className="mt-space-sm text-body-sm text-on-surface-variant">
    <summary className="cursor-pointer text-primary font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded hover:underline">
      {summary}
    </summary>
    <div className="mt-2 p-3 bg-surface-container-low rounded-lg leading-relaxed border border-surface-container-highest/40">
      {children}
    </div>
  </details>
);

export const ExperimentalNotice = () => null;

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmLabel,
  tone,
  isDanger = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;
  const finalConfirmText = confirmLabel || confirmText;
  const isCritical = isDanger || tone === 'critical' || tone === 'danger';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-surface-container-highest p-space-xl">
        <h3 className="text-headline-sm font-semibold text-on-surface">{title}</h3>
        <p className="text-body-md text-on-surface-variant mt-2 leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-3 mt-space-xl">
          <Btn variant="secondary" onClick={onCancel} disabled={busy}>{cancelText}</Btn>
          <Btn variant={isCritical ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{finalConfirmText}</Btn>
        </div>
      </div>
    </div>
  );
};

