import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { fetchDatasetsForVehicle } from '../api/datasetApi';
import { fetchPredictionById, fetchInsightsForPrediction, requestPredictionExplanation } from '../api/predictionApi';
import { Card, Skeleton, PageHeader, EmptyState, ErrorState, Badge, Btn } from '../components/common/ui';
import { LineChart } from '../components/charts/Charts';
import { fmt, has, healthLabel, tempLabel, trendSummary } from '../utils/battery';
import { buildInsights, buildFactors, impactTone, sohHistory, avgTemp } from '../utils/insights';
import { formatTimestampIST, formatReportDate } from '../utils/mappers';

const toneOf = (s) => (s === 'Healthy' ? 'good' : s === 'Attention' ? 'warn' : s === 'Critical' ? 'bad' : 'neutral');

const List = ({ items, icon, empty }) =>
  items.length ? (
    <ul className="space-y-2.5">
      {items.map((x, i) => (
        <li key={i} className="flex items-start gap-2 text-body-md">
          <span className="material-symbols-outlined text-[18px] text-primary mt-0.5" aria-hidden="true">
            {icon}
          </span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-body-md text-on-surface-variant">{empty}</p>
  );

function AnalysisDetailPage({ id, onClose }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const p = await fetchPredictionById(id);
        let ins = null;
        try {
          ins = await fetchInsightsForPrediction(id);
        } catch {}
        if (on) setState({ p, ins, loading: false });
      } catch {
        if (on) setState({ error: true, loading: false });
      }
    })();
    return () => {
      on = false;
    };
  }, [id]);

  const { p, ins } = state;

  return (
    <div className="space-y-space-md" aria-label="Analysis details">
      <div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-body-md font-medium text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
          Back to Insight / Analysis History
        </button>
      </div>
      <Card title="Analysis details" subtitle="Complete record for the selected analysis only.">
        <div className="space-y-space-md">
          {state.loading && <Skeleton className="h-64" />}
          {state.error && (
            <p role="alert" className="text-body-md text-error">
              Unable to load this evaluation record. Please try again.
            </p>
          )}

          {p && (
            <div className="space-y-4">
              <div className="p-3 bg-surface-container-low rounded-xl border border-surface-container-highest/60 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-on-surface">{p.vehicleName || 'EV Battery'}</div>
                  <div className="text-xs text-on-surface-variant">
                    {p.measurementDate || p.prediction?.measurementDate ? `Measured: ${formatReportDate(p.measurementDate || p.prediction?.measurementDate)} · ` : ''}Uploaded: {formatTimestampIST(p.createdAt)}
                  </div>
                </div>
                <Badge tone={toneOf(p.prediction?.status || 'Healthy')}>
                  {p.prediction?.status || 'Evaluated'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-body-md">
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <div className="text-body-sm text-on-surface-variant">Battery Health</div>
                  <div className="text-2xl font-bold font-mono text-primary">{fmt(p.prediction?.soh)}%</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <div className="text-body-sm text-on-surface-variant">Remaining Life</div>
                  <div className="text-2xl font-bold font-mono text-on-surface">
                    {has(p.prediction?.rulCycles) ? `${fmt(p.prediction.rulCycles, 0)} cycles` : 'Not available'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <div className="text-body-sm text-on-surface-variant">Capacity</div>
                  <div className="font-mono font-semibold">
                    {has(p.prediction?.currentCapacityAh) ? `${fmt(p.prediction.currentCapacityAh, 2)} Ah` : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <div className="text-body-sm text-on-surface-variant">Recorded Cycle</div>
                  <div className="font-mono font-semibold">{fmt(p.prediction?.currentCycle, 0) ?? '—'}</div>
                </div>
              </div>

              {p.degradation?.historical?.length > 1 && (
                <div className="p-3 rounded-xl border border-surface-container-highest bg-surface-container-lowest">
                  <h4 className="font-semibold text-xs text-on-surface-variant uppercase mb-2">Cycle Degradation Curve</h4>
                  <LineChart
                    data={p.degradation.historical.map((d) => ({ x: d.cycle, y: d.soh }))}
                    xLabel="Cycle"
                    yLabel="SOH (%)"
                    unit="%"
                    height={200}
                  />
                </div>
              )}

              {ins?.summary && (
                <div className="p-3.5 rounded-xl bg-[#f4f7f5] border border-[#dcebe3] text-sm text-[#1c1e21]">
                  <strong>Diagnostic Summary:</strong> {ins.summary}
                </div>
              )}

              {ins?.recommendations?.length > 0 && (
                <div className="space-y-1">
                  <h4 className="font-semibold text-xs uppercase text-on-surface-variant">Recommendations:</h4>
                  <ul className="list-disc pl-5 text-body-sm space-y-1 text-on-surface-variant">
                    {ins.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function InsightsMain({ initialTab = 'overview', onOpenDetail }) {
  const { vehicles, predictions, notifications, setCurrentTab, predictionsLoading, predictionsError, refreshPredictions } = useApp();
  const { vehicle: v, loading, error, retry } = useVehicleDetail();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync initialTab if changed
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Insights builder
  const ins = buildInsights(v);
  const factors = buildFactors(v);

  // Groq Explainable AI State
  const [aiExplanation, setAiExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [explainError, setExplainError] = useState('');

  // History & Uploads State
  const [uploads, setUploads] = useState([]);
  const [filters, setFilters] = useState({ vehicle: 'all', status: 'all' });

  useEffect(() => {
    let on = true;
    (async () => {
      const all = await Promise.all(
        vehicles.map((veh) =>
          fetchDatasetsForVehicle(veh.id)
            .then((r) => (r.datasets || []).map((d) => ({ ...d, vehicleName: veh.name })))
            .catch(() => [])
        )
      );
      if (on) setUploads(all.flat());
    })();
    return () => {
      on = false;
    };
  }, [vehicles]);

  const latestPredictionId = v?.latestPredictionId || predictions[0]?.id;

  const handleRequestExplanation = async (q = null) => {
    if (!latestPredictionId) return;
    setExplaining(true);
    setExplainError('');
    try {
      const exp = await requestPredictionExplanation(latestPredictionId, q);
      setAiExplanation(exp);
    } catch (err) {
      setExplainError('Unable to generate AI explanation at this moment. Showing deterministic rule results.');
    } finally {
      setExplaining(false);
    }
  };

  // Timeline derivation
  const timeline = useMemo(
    () =>
      [
        ...predictions.map((p) => ({
          t: p.measurementDate || p.timestampRaw,
          kind: 'Battery analysis',
          icon: 'monitor_heart',
          text: `${p.vehicleName}: battery health evaluated at ${fmt(p.measuredSoh) ?? '—'}% (Cycle ${p.currentCycle || p.prediction?.currentCycle || '—'})${p.measurementDate ? ` · Measured on ${formatReportDate(p.measurementDate)}` : ''}`,
          id: p.id,
        })),
        ...uploads.map((d) => ({
          t: d.uploadedAt,
          kind: 'Data upload',
          icon: 'upload_file',
          text: `${d.vehicleName}: ${d.originalFileName}${d.recordCount ? ` (${d.recordCount.toLocaleString()} telemetry rows)` : ''}`,
        })),
        ...notifications
          .filter((n) => n.type === 'battery_health_change')
          .map((n) => ({
            t: n.createdAt,
            kind: 'Battery health alert',
            icon: 'trending_down',
            text: n.message,
          })),
      ]
        .filter((e) => e.t)
        .sort((a, b) => new Date(b.t) - new Date(a.t)),
    [predictions, uploads, notifications]
  );

  const filteredAnalyses = useMemo(() => {
    return predictions
      .filter(
        (p) =>
          (filters.vehicle === 'all' || p.vehicleId === filters.vehicle) &&
          (filters.status === 'all' || p.status === filters.status)
      )
      .sort((a, b) => new Date(b.timestampRaw || b.uploadTimestamp || b.createdAt || 0) - new Date(a.timestampRaw || a.uploadTimestamp || a.createdAt || 0));
  }, [predictions, filters]);

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const selClass = 'h-9 px-3 rounded-lg border border-surface-container-highest/80 bg-surface-container-lowest text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none';

  const SUGGESTED_QUESTIONS = [
    "What is the ML model's accuracy?",
    "Why is my battery health at this level?",
    "How was Remaining Useful Life (RUL) calculated?",
    "How can I extend my battery lifespan?",
    "Explain what cell voltage spread means.",
  ];

  return (
    <div className="space-y-space-xl pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>Intelligent Diagnostics</span>
            <span>/</span>
            <span className="text-primary font-semibold">Authoritative Evidence</span>
          </div>
          <PageHeader
            title="Insight"
            subtitle="Verified battery health diagnostics, historical logs, degradation trends, and natural-language AI."
          />
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-surface-container-low p-1.5 rounded-xl border border-surface-container-highest/60 self-start md:self-auto">
          {[
            { id: 'overview', label: 'Diagnostics & AI', icon: 'psychology' },
            { id: 'analyses', label: 'Past Analyses', icon: 'query_stats' },
            { id: 'timeline', label: 'Activity Timeline', icon: 'history' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState onRetry={retry} />}

      {/* TAB 1: Diagnostics & AI Overview */}
      {activeTab === 'overview' && (!v?.hasAnalysis && !predictions.length ? (
        <Card>
          <EmptyState
            icon="lightbulb"
            title="No diagnostic insights available yet"
            text="Analyze your EV battery telemetry on the SOH & RUL page to generate diagnostic interpretations, degradation factors, and explainable AI."
            actionLabel="Analyze Battery Health"
            onAction={() => setCurrentTab('analysis')}
          />
        </Card>
      ) : (
        <div className="space-y-space-xl">
          {/* Explainable AI Interactive Assistant Card */}
          <Card
            title="Explainable Assistant"
            subtitle="Natural-language interpretation powered by verified Random Forest & Gradient Boosting ML models."
            action={
              <Btn
                onClick={() => handleRequestExplanation()}
                disabled={explaining || !latestPredictionId}
                className="text-xs flex items-center gap-1.5"
              >
                <span className={`material-symbols-outlined text-[16px] ${explaining ? 'animate-spin' : ''}`}>
                  {explaining ? 'progress_activity' : 'psychology'}
                </span>
                {explaining ? 'Interpreting Data…' : 'Explain My Battery Condition'}
              </Btn>
            }
          >
            <div className="space-y-4">
              {/* Question Suggestions */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-on-surface-variant">Ask Assistant:</span>
                {SUGGESTED_QUESTIONS.map((qText) => (
                  <button
                    key={qText}
                    onClick={() => {
                      setCustomQuestion(qText);
                      handleRequestExplanation(qText);
                    }}
                    disabled={explaining || !latestPredictionId}
                    className="px-2.5 py-1 rounded-full text-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-highest text-on-surface transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {qText}
                  </button>
                ))}
              </div>

              {/* Custom Prompt Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-surface-container-highest/60">
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customQuestion.trim()) {
                      handleRequestExplanation(customQuestion);
                    }
                  }}
                  placeholder="Ask a specific question (e.g., 'What is the ML model accuracy?', 'Why is SOH 88%?')..."
                  className="flex-1 h-9 px-3 text-xs bg-surface-container-low rounded-lg border border-surface-container-highest/80 focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <Btn
                  onClick={() => handleRequestExplanation(customQuestion)}
                  disabled={explaining || !customQuestion.trim() || !latestPredictionId}
                  className="h-9 px-3 text-xs"
                >
                  Ask AI
                </Btn>
              </div>

              {explainError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  {explainError}
                </div>
              )}

              {/* AI Explanation Output Display */}
              {aiExplanation ? (
                <div className="space-y-4 pt-3 border-t border-surface-container-highest/60 animate-in fade-in">
                  {aiExplanation.warning && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">info</span>
                      <span>{aiExplanation.warning}</span>
                    </div>
                  )}
                  <div className="p-4 rounded-xl bg-[#f4f7f5] border border-[#dcebe3] text-[#1c1e21] font-medium text-sm flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">verified</span>
                    <div>
                      <div className="font-semibold text-xs text-primary uppercase tracking-wide mb-1">
                        AI Diagnostic Summary ({aiExplanation.source === 'groq_ai' ? 'Groq LLM' : 'Verified Rule Engine'})
                      </div>
                      <p>{aiExplanation.summary}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl border border-surface-container-highest bg-surface-container-lowest">
                      <h4 className="font-semibold text-xs uppercase text-on-surface flex items-center gap-1.5 mb-1.5">
                        <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                        What Your SOH Means
                      </h4>
                      <p className="text-body-sm text-on-surface-variant">
                        {aiExplanation.sections?.meaning}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-surface-container-highest bg-surface-container-lowest">
                      <h4 className="font-semibold text-xs uppercase text-on-surface flex items-center gap-1.5 mb-1.5">
                        <span className="material-symbols-outlined text-amber-600 text-[18px]">timelapse</span>
                        Remaining Life & Model Context
                      </h4>
                      <p className="text-body-sm text-on-surface-variant">
                        {aiExplanation.sections?.rulMeaning}
                      </p>
                    </div>
                  </div>

                  {aiExplanation.sections?.evidenceSummary && (
                    <div className="p-3.5 rounded-xl border border-surface-container-highest bg-surface-container-low/50 text-xs text-on-surface">
                      <strong>Supporting Evidence:</strong> {aiExplanation.sections.evidenceSummary}
                    </div>
                  )}

                  {aiExplanation.sections?.limitations && (
                    <div className="p-3.5 rounded-xl border border-amber-200 bg-[#fffdfa] text-xs text-amber-900">
                      <strong>Analysis Scope & Limitations:</strong> {aiExplanation.sections.limitations}
                    </div>
                  )}

                  {aiExplanation.sections?.nextSteps?.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-surface-container-highest bg-surface-container-lowest">
                      <h4 className="font-semibold text-xs uppercase text-on-surface mb-2">Recommended Practical Next Steps:</h4>
                      <ul className="space-y-1.5 pl-5 list-disc text-body-sm text-on-surface-variant">
                        {aiExplanation.sections.nextSteps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex items-center justify-between">
                  <span>Click <strong>&quot;Explain My Battery Condition&quot;</strong> or choose any question above to generate an instant natural-language evaluation.</span>
                  <span className="text-[11px] font-mono text-outline">Verified NASA Benchmarks</span>
                </div>
              )}
            </div>
          </Card>

          {/* Primary Battery Summary Card */}
          <Card title="Diagnostic Battery Summary">
            {loading ? <Skeleton className="h-16" /> : <p className="text-body-lg text-[#1c1e21]">{ins.summary}</p>}
          </Card>

          {/* Key Findings and Positive Indicators */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-xl">
            <Card title="Operating Strengths">
              {loading ? (
                <Skeleton className="h-24" />
              ) : (
                <List items={ins.good} icon="check_circle" empty="No specific operational strengths identified." />
              )}
            </Card>
            <Card title="Points Requiring Attention">
              {loading ? (
                <Skeleton className="h-24" />
              ) : (
                <List items={ins.attention} icon="info" empty="No abnormal battery conditions detected." />
              )}
            </Card>
          </div>

          {/* Degradation Factors & Empirical Evidence */}
          <Card
            title={has(v?.soh) ? `Why is my battery health evaluated at ${fmt(v.soh)}%?` : 'Battery Health Rationale'}
            subtitle="The physical degradation factors correlated with capacity fade based on your measurements."
          >
            {loading ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="space-y-3">
                <p className="text-body-md text-on-surface">
                  {has(v.currentCapacityAh) && has(v.referenceCapacityAh)
                    ? `Usable capacity was evaluated at ${fmt(v.currentCapacityAh, 2)} Ah compared with ${fmt(v.referenceCapacityAh, 2)} Ah when new. State of Health directly reflects this retention ratio.`
                    : 'Capacity measurements are derived from discharge cycle telemetry.'}
                </p>
                <ul className="divide-y divide-surface-container-highest/60">
                  {factors.map((f) => (
                    <li key={f.name} className="py-2.5 flex flex-wrap items-center gap-2">
                      <span className="font-semibold w-48 text-sm">{f.name}</span>
                      <Badge tone={impactTone(f.impact)}>{f.impact}</Badge>
                      <span className="text-body-sm text-on-surface-variant flex-1 min-w-[220px]">
                        {f.explanation}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      ))}

      {/* TAB 2: Historical Analyses Log */}
      {activeTab === 'analyses' && (
        <Card
          title="Past Battery Evaluations"
          subtitle="Complete historical record of machine learning health evaluations performed on your EV."
        >
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select className={selClass} value={filters.vehicle} onChange={setF('vehicle')}>
              <option value="all">All Vehicles</option>
              {vehicles.map((veh) => (
                <option key={veh.id} value={veh.id}>
                  {veh.name}
                </option>
              ))}
            </select>
            <select className={selClass} value={filters.status} onChange={setF('status')}>
              <option value="all">All Statuses</option>
              <option value="Healthy">Healthy</option>
              <option value="Attention">Attention</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          {predictionsError && <ErrorState text={predictionsError} onRetry={() => refreshPredictions()} />}
          {predictionsLoading ? <Skeleton className="h-32" /> : predictionsError && !filteredAnalyses.length ? null : !filteredAnalyses.length ? (
            <EmptyState
              icon="query_stats"
              title="No battery analysis records found"
              text="No past evaluations match your filter criteria, or no analyses have been completed yet."
              actionLabel="Analyze Battery Health"
              onAction={() => setCurrentTab('analysis')}
            />
          ) : (
            <div className="overflow-x-auto">
              <ul className="divide-y divide-surface-container-highest/60">
                {filteredAnalyses.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => onOpenDetail(p.id)}
                      className="w-full text-left py-3.5 px-3 rounded-xl flex flex-wrap items-center justify-between gap-3 hover:bg-surface-container-low transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center font-bold text-xs">
                          {p.prediction?.currentCycle || '—'}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-on-surface group-hover:text-primary transition-colors">
                            {p.vehicleName} · Cycle {p.prediction?.currentCycle ?? '—'}
                          </div>
                          <div className="text-xs text-on-surface-variant">
                            {p.measurementDate ? (
                              <span>
                                <strong className="text-on-surface">Measured: {formatReportDate(p.measurementDate)}</strong>
                                {p.uploadTimestamp ? ` · Uploaded: ${p.uploadTimestamp}` : ''}
                              </span>
                            ) : (
                              <span>Uploaded: {p.timestamp}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-mono font-bold text-sm text-primary">
                            SOH {fmt(p.measuredSoh) ?? '—'}%
                          </div>
                          <div className="text-xs text-on-surface-variant">
                            {has(p.rulCycles) ? `RUL: ~${fmt(p.rulCycles, 0)} cycles` : 'RUL: n/a'}
                          </div>
                        </div>
                        <Badge tone={toneOf(p.status)}>{p.status}</Badge>
                        <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                          chevron_right
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: Activity Timeline */}
      {activeTab === 'timeline' && (
        <Card
          title="Telemetry Activity Timeline"
          subtitle="Unified chronological log of battery uploads, diagnostic runs, and safety alerts."
        >
          {!timeline.length ? (
            <EmptyState
              icon="history"
              title="No activity recorded yet"
              text="Upload battery telemetry to initiate your chronological maintenance and health timeline."
              actionLabel="Analyze Battery Health"
              onAction={() => setCurrentTab('analysis')}
            />
          ) : (
            <ol className="relative border-l border-surface-container-highest ml-3 space-y-5 my-2">
              {timeline.map((e, i) => (
                <li key={i} className="ml-6">
                  <span className="absolute -left-3 w-6 h-6 rounded-full bg-surface-container border border-surface-container-highest flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                      {e.icon}
                    </span>
                  </span>
                  <div className="text-xs text-on-surface-variant font-mono">
                    {e.kind} · {formatTimestampIST(e.t)}
                  </div>
                  <div className="text-body-md font-medium text-on-surface mt-0.5">{e.text}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

    </div>
  );
}

const HASH_PREFIX = '#/insight/analysis/';
const idFromHash = () => (window.location.hash.startsWith(HASH_PREFIX) ? decodeURIComponent(window.location.hash.slice(HASH_PREFIX.length)) : null);

export default function Insights(props) {
  const [detailId, setDetailId] = useState(idFromHash);

  useEffect(() => {
    const sync = () => setDetailId(idFromHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const open = (id) => {
    window.history.pushState({ analysisId: id }, '', `${HASH_PREFIX}${encodeURIComponent(id)}`);
    setDetailId(id);
    window.scrollTo?.(0, 0);
  };
  const close = () => {
    if (window.history.state && window.history.state.analysisId) window.history.back();
    else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setDetailId(null);
    }
  };

  if (detailId) return <AnalysisDetailPage key={detailId} id={detailId} onClose={close} />;
  return <InsightsMain {...props} onOpenDetail={open} />;
}
