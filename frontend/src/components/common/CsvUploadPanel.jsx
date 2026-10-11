import React, { useState } from 'react';
import * as XLSX from 'xlsx';

const ALIASES = {
  cycle: ['cycle', 'cycle_number', 'cycle_index', 'cycle_count', 'cyc', '__cycle__'],
  capacity: ['discharge_capacity', 'capacity', 'capacity_ah', 'discharge_capacity_ah', 'cap'],
  voltage: ['battery_voltage', 'voltage_measured', 'mean_voltage', 'voltage', 'cell_voltage', 'pack_voltage', 'v', 'v_measured', 'hv_voltage', 'bcell_maxvoltage', 'bcell_minvoltage'],
  current: ['battery_current', 'current_measured', 'mean_current', 'current', 'i', 'i_measured', 'hv_current'],
  temperature: ['battery_temperature', 'max_battery_temperature', 'temperature_measured', 'mean_temperature', 'temperature', 'temp', 'cell_temperature', 't', 'bcell_maxtemp', 'bcell_mintemp'],
  time: ['time', 'relative_time', 'timestamp', 'time_s', 'seconds', 'duration'],
  soc: ['soc', 'displayed_soc', 'state_of_charge', 'soc_percent', 'battery_level', 'bcell_soc'],
};

const MAX_PREVIEW_BYTES = 256 * 1024;

function detectDelimiter(line) {
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  const t = (line.match(/\t/g) || []).length;
  if (s > c && s > t) return ';';
  if (t > c && t > s) return '\t';
  return ',';
}

function splitLine(line, d) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === d && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const norm = (h) => h.toLowerCase().replace(/[\s-]+/g, '_');
const hasCol = (headers, key) => headers.some((h) => ALIASES[key].includes(norm(h)));

/** Reads only the first chunk or sheets of the file; row count is exact only if the file fits in the chunk. */
export async function previewCsv(file) {
  const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
  if (isExcel) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return { empty: true };
      const csvText = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length === 0) return { empty: true };
      const delimiter = ',';
      const headers = splitLine(lines[0], delimiter);
      const rows = lines.slice(1, 101).map((l) => splitLine(l, delimiter));
      return { empty: false, delimiter, headers, rows, truncated: lines.length > 101, rowCount: lines.length - 1 };
    } catch {
      return { empty: true };
    }
  }

  const chunk = file.slice(0, MAX_PREVIEW_BYTES);
  const text = (await chunk.text()).replace(/^\uFEFF/, '');
  const truncated = file.size > MAX_PREVIEW_BYTES;
  let lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (truncated) lines = lines.slice(0, -1); // last line may be cut off
  if (lines.length === 0) return { empty: true };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => splitLine(l, delimiter));
  return { empty: false, delimiter, headers, rows, truncated, rowCount: rows.length };
}

/** Indicative, header-based eligibility. The server makes the final decision. */
export function analysisEligibility(p) {
  if (!p || p.empty) return [];
  const H = p.headers;
  const cycleLike = hasCol(H, 'cycle');
  const cap = hasCol(H, 'capacity');
  const telemetry = hasCol(H, 'voltage') || hasCol(H, 'temperature') || hasCol(H, 'current') || hasCol(H, 'soc');
  const enoughRows = p.truncated || p.rowCount >= 7;
  const mk = (name, ok, okMsg, failMsg) => ({ name, ok, msg: ok ? okMsg : failMsg });
  return [
    mk('File validation', cycleLike || hasCol(H, 'time') || telemetry, 'Recognised battery columns found.', 'Quick preview did not recognise these headers. This is not a verdict: the server inspects the actual values and decides after upload.'),
    mk('Anomaly detection', telemetry, 'Voltage / temperature / current data present.', 'Needs a voltage, temperature, current or SOC column.'),
    mk('SOH estimation', cycleLike && cap && enoughRows, 'Cycle and capacity columns present.', !cap ? 'Needs a capacity column (not found).' : !cycleLike ? 'Needs a cycle column (not found).' : 'Needs at least 7 cycles of data.'),
    mk('RUL prediction', cycleLike && cap && enoughRows, 'Cycle and capacity columns present (7+ cycles needed).', !cap ? 'Needs a capacity column (not found).' : !cycleLike ? 'Needs a cycle column (not found).' : 'Needs at least 7 cycles of data.'),
  ];
}

export default function CsvUploadPanel({ onAnalyze, uploading, stage, error, success, disabled, serverReport }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [localError, setLocalError] = useState('');

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setLocalError('');
    setPreview(null);
    const ext = f.name.toLowerCase();
    if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setFile(null);
      setLocalError('Only .csv and .xlsx spreadsheets are supported.');
      return;
    }
    setFile(f);
    try {
      const p = await previewCsv(f);
      if (p.empty) setLocalError('This file is empty.');
      setPreview(p);
    } catch {
      setLocalError('Could not read this file.');
    }
  };

  const elig = analysisEligibility(preview);
  const canRun = !!file && !!preview && !preview.empty && !uploading && !disabled;
  const clear = () => { setFile(null); setPreview(null); setLocalError(''); };

  return (
    <div className="rounded-2xl bg-surface-container-lowest border border-surface-container-highest/60 shadow-sm p-space-lg space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">battery_charging_full</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-on-surface">Upload battery data (CSV / Excel)</h3>
            <p className="text-xs text-on-surface-variant">Select a CSV or Excel spreadsheet to inspect columns and determine eligible analyses.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className={`cursor-pointer inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-semibold border border-primary text-primary hover:bg-primary/5 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="material-symbols-outlined text-[16px]">folder_open</span>
            <span>{file ? 'Change file' : 'Choose CSV / Excel'}</span>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={pick} className="hidden" disabled={uploading} />
          </label>
          <button type="button" onClick={() => canRun && onAnalyze(file)} disabled={!canRun}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-semibold bg-primary text-on-primary disabled:opacity-40">
            <span className={`material-symbols-outlined text-[16px] ${uploading ? 'animate-spin' : ''}`}>{uploading ? 'progress_activity' : 'play_arrow'}</span>
            <span>{uploading ? 'Analyzing…' : 'Upload & analyze'}</span>
          </button>
        </div>
      </div>

      {localError && <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs">{localError}</div>}

      {file && preview && !preview.empty && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-surface-container-highest/60 p-3 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-on-surface truncate">{file.name}</p>
              <button type="button" onClick={clear} disabled={uploading} className="text-[11px] text-on-surface-variant underline">Remove</button>
            </div>
            <p className="text-[11px] text-on-surface-variant mb-2">
              {(file.size / 1024).toFixed(1)} KB · {preview.headers.length} columns · {preview.truncated ? `${preview.rowCount}+ rows (preview of first ${MAX_PREVIEW_BYTES / 1024} KB)` : `${preview.rowCount} rows`} · delimiter “{preview.delimiter === '\t' ? 'tab' : preview.delimiter}”
            </p>
            <div className="overflow-x-auto">
              <table className="text-[11px] w-full">
                <thead><tr>{preview.headers.slice(0, 8).map((h, i) => <th key={i} className="text-left pr-3 pb-1 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri}>{r.slice(0, 8).map((c, ci) => <td key={ci} className="pr-3 py-0.5 text-on-surface-variant whitespace-nowrap">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.headers.length > 8 && <p className="text-[11px] text-on-surface-variant mt-1">+{preview.headers.length - 8} more columns</p>}
          </div>

          <div className="rounded-xl border border-surface-container-highest/60 p-3">
            <p className="text-xs font-semibold text-on-surface mb-2">{serverReport ? 'Server results (authoritative)' : 'Preliminary estimate (column names only, not final)'}</p>
            {serverReport ? (
              <ul className="space-y-1.5">
                {serverReport.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-xs">
                    <span className={`material-symbols-outlined text-[16px] ${a.status === 'completed' ? 'text-primary' : a.status === 'failed' ? 'text-error' : 'text-amber-600'}`}>{a.status === 'completed' ? 'check_circle' : a.status === 'failed' ? 'error' : a.status === 'pending' ? 'hourglass_top' : 'info'}</span>
                    <span><span className="font-medium text-on-surface">{a.name}: {a.status}.</span> <span className="text-on-surface-variant">{a.reason}{a.limitation ? ` ${a.limitation}` : ''}{Number.isFinite(a.validRecords) ? ` (${a.validRecords} valid records)` : ''}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
            <ul className="space-y-1.5">
              {elig.map((a) => (
                <li key={a.name} className="flex items-start gap-2 text-xs">
                  <span className={`material-symbols-outlined text-[16px] ${a.ok ? 'text-primary' : 'text-amber-600'}`}>{a.ok ? 'check_circle' : 'warning'}</span>
                  <span><span className="font-medium text-on-surface">{a.name}:</span> <span className="text-on-surface-variant">{a.ok ? 'Looks eligible (preliminary). ' : 'Not detected from headers (preliminary). '}{a.msg}</span></span>
                </li>
              ))}
            </ul>
            )}
            {!serverReport && <p className="text-[11px] text-on-surface-variant mt-2">Preliminary. The server validates the full file and replaces this with the final per-analysis result after upload.</p>}
          </div>
        </div>
      )}

      {(uploading || stage) && (
        <div className="p-3 rounded-xl bg-primary-container/20 border border-primary/30 text-primary text-xs flex items-center gap-2">
          <span className={`material-symbols-outlined text-[16px] ${uploading ? 'animate-spin' : ''}`}>{uploading ? 'progress_activity' : 'check_circle'}</span>
          <span>{stage}</span>
        </div>
      )}
      {success && !uploading && <div className="p-3 rounded-xl bg-primary-container/20 border border-primary/30 text-primary text-xs">{success}</div>}
      {error && <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs">{error}</div>}
    </div>
  );
}
