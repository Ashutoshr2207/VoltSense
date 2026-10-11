export const fmt = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString() : null);
export const has = (v) => typeof v === 'number' && Number.isFinite(v);

export function healthLabel(soh) {
  if (!has(soh)) return { label: 'No data', tone: 'neutral', text: 'Upload battery data to see your battery health.' };
  if (soh >= 90) return { label: 'Healthy', tone: 'good', text: 'Your battery is performing normally.' };
  if (soh >= 80) return { label: 'Good', tone: 'good', text: 'Your battery is ageing gently.' };
  if (soh >= 70) return { label: 'Needs attention', tone: 'warn', text: 'Your battery has lost noticeable capacity.' };
  return { label: 'Critical', tone: 'bad', text: 'Your battery is near the end of its useful life.' };
}

export function tempLabel(t) {
  if (!has(t)) return { label: 'No data', tone: 'neutral' };
  if (t >= 40) return { label: 'High', tone: 'bad' };
  if (t >= 35) return { label: 'Elevated', tone: 'warn' };
  return { label: 'Normal', tone: 'good' };
}

export const toneClasses = {
  good: 'bg-secondary-container/60 text-on-secondary-container',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-error-container text-on-error-container',
  neutral: 'bg-surface-container text-on-surface-variant',
};

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function trendSummary(history) {
  if (!history || history.length < 3) return null;
  const n = history.length;
  const first = history[0].soh, last = history[n - 1].soh;
  const recentIdx = Math.max(0, n - Math.max(3, Math.floor(n / 4)));
  const recentDrop = history[recentIdx].soh - last;
  const recentSteps = Math.max(1, n - 1 - recentIdx);
  const overallRate = (first - last) / Math.max(1, n - 1);
  const recentRate = recentDrop / recentSteps;
  if (first - last < 0.5) return { key: 'stable', text: 'Your battery health has been stable.' };
  if (recentRate > overallRate * 1.5 && recentRate > 0.05) return { key: 'faster', text: 'Health is declining faster than earlier in the data.' };
  return { key: 'gradual', text: 'Your battery health is declining gradually.' };
}
