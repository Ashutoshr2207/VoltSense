import os
import sys
import json
import argparse
import warnings
warnings.filterwarnings('ignore')
import joblib
import pandas as pd
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
SOH_MODEL_PATH = os.path.join(MODEL_DIR, 'soh_model.joblib')
RUL_MODEL_PATH = os.path.join(MODEL_DIR, 'rul_model.joblib')
METADATA_PATH = os.path.join(MODEL_DIR, 'model_metadata.json')

DEFAULT_IMPEDANCE = {
    'Re': 0.082,
    'Rct': 0.165,
    'battery_impedance': 0.076,
    'rectified_impedance': 0.145
}

def normalize_column_name(col):
    return str(col).strip().lower().replace(' ', '_').replace('-', '_')

def resolve_column(col_map, candidates):
    for cand in candidates:
        norm = normalize_column_name(cand)
        if norm in col_map:
            return col_map[norm]
    return None

def observed_diagnostics(df, col_map):
    """Return diagnostics only when their required telemetry is present."""
    internal_resistance_mohm = None
    v_load_col = resolve_column(col_map, ['voltage_load', 'load_voltage', 'v_load'])
    i_load_col = resolve_column(col_map, ['current_load', 'load_current', 'i_load'])
    v_meas_col = resolve_column(col_map, ['voltage_measured', 'measured_voltage', 'v_measured', 'voltage'])

    if v_load_col and i_load_col and v_meas_col:
        measured_v = pd.to_numeric(df[v_meas_col], errors='coerce')
        load_v = pd.to_numeric(df[v_load_col], errors='coerce')
        load_i = pd.to_numeric(df[i_load_col], errors='coerce').abs()
        resistance = ((measured_v - load_v).abs() / load_i.replace(0, np.nan)) * 1000.0
        resistance = resistance.replace([np.inf, -np.inf], np.nan).dropna()
        resistance = resistance[(resistance > 0) & (resistance < 1000)]
        if not resistance.empty:
            internal_resistance_mohm = round(float(resistance.median()), 2)
    elif 're' in col_map:
        re_val = pd.to_numeric(df[col_map['re']], errors='coerce').dropna()
        if not re_val.empty:
            internal_resistance_mohm = round(float(re_val.iloc[-1] * 1000.0), 2)

    cell_columns = [
        column for norm, column in col_map.items()
        if norm.startswith('cell_') and ('voltage' in norm or norm.endswith('_v'))
    ]
    cell_imbalance_mv = None
    if len(cell_columns) >= 2:
        cell_values = df[cell_columns].apply(pd.to_numeric, errors='coerce')
        spreads = (cell_values.max(axis=1) - cell_values.min(axis=1)).dropna() * 1000.0
        if not spreads.empty:
            cell_imbalance_mv = round(float(spreads.max()), 1)

    return {
        'internalResistanceMOhm': internal_resistance_mohm,
        'cellImbalanceMv': cell_imbalance_mv,
    }

def fit_linear_degradation(cycles, sohs):
    """
    Fits SOH(c) = slope * c + intercept via ordinary least squares.
    Returns slope, intercept, r2, count.
    """
    if len(cycles) < 2:
        return None, None, None, len(cycles)
    
    x = np.array(cycles, dtype=float)
    y = np.array(sohs, dtype=float)
    
    # Check variance
    if np.var(x) == 0:
        return 0.0, float(np.mean(y)), 0.0, len(cycles)
        
    slope, intercept = np.polyfit(x, y, 1)
    y_pred = slope * x + intercept
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    ss_res = np.sum((y - y_pred) ** 2)
    
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
    r2 = max(0.0, min(1.0, float(r2)))
    
    return float(slope), float(intercept), float(r2), len(cycles)

def predict_from_csv(csv_path, eol_threshold=70.0, battery_id=None):
    if not os.path.exists(csv_path):
        return {"success": False, "error": f"File not found: {csv_path}"}
        
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        return {"success": False, "error": f"Failed to parse CSV: {str(e)}"}

    if df.empty:
        return {"success": False, "error": "CSV file contains no rows."}

    # Normalize column names for flexible detection
    col_map = {normalize_column_name(c): c for c in df.columns}

    # Detect battery identifier column if present
    battery_col = resolve_column(col_map, ['battery_id', 'battery', 'cell_id', 'cell', 'cell_name', 'batteryid'])
    available_batteries = []
    if battery_col and battery_col in df.columns:
        unique_bats = [str(b).strip() for b in df[battery_col].dropna().unique() if str(b).strip() != '']
        available_batteries = sorted(list(set(unique_bats)))
        if battery_id:
            df = df[df[battery_col].astype(str).str.strip() == str(battery_id).strip()]
            if df.empty:
                return {
                    "success": False,
                    "error": f"Battery '{battery_id}' not found in dataset. Available batteries: {', '.join(available_batteries)}"
                }
        else:
            # Default to first battery in the list
            chosen_battery = available_batteries[0]
            battery_id = chosen_battery
            df = df[df[battery_col].astype(str).str.strip() == chosen_battery]
    else:
        battery_id = "NASA Cell / Battery 01"

    # Determine schema type: Cycle-level summary VS Raw time-series telemetry
    cycle_col = resolve_column(col_map, ['cycle', 'cycle_number', 'cycle_index', 'cycle_count', 'cyc'])
    cap_col = resolve_column(col_map, ['discharge_capacity', 'capacity', 'capacity_ah', 'discharge_capacity_ah', 'cap'])
    v_meas_col = resolve_column(col_map, ['voltage_measured', 'mean_voltage', 'voltage', 'cell_voltage', 'v', 'v_measured'])
    i_meas_col = resolve_column(col_map, ['current_measured', 'mean_current', 'current', 'i', 'i_measured'])
    t_meas_col = resolve_column(col_map, ['temperature_measured', 'mean_temperature', 'temperature', 'temp', 'cell_temperature', 't'])
    time_col = resolve_column(col_map, ['time', 'relative_time', 'timestamp', 'time_s', 'seconds', 'duration'])
    duration_col = resolve_column(col_map, ['discharge_duration', 'duration_s'])
    type_col = resolve_column(col_map, ['type', 'operation', 'oper_type', 'operation_type'])

    if not cycle_col:
        return {"success": False, "error": "Missing cycle column in CSV. Expected 'Cycle' or 'cycle_number'."}
    if not cap_col and not v_meas_col:
        return {"success": False, "error": "CSV must contain either Capacity or Voltage telemetry."}

    # Filter operation type if 'type' column exists (e.g. NASA Kaggle metadata format)
    if type_col and 'type' in col_map:
        # Keep discharge operations for capacity/cycle tracking
        type_vals = df[type_col].astype(str).str.lower()
        if 'discharge' in type_vals.values:
            df_discharges = df[type_vals == 'discharge']
        else:
            df_discharges = df
    else:
        df_discharges = df

    # Check if this is a pre-aggregated cycle summary table (e.g. ml/data/nasa_battery_cycles.csv)
    is_cycle_summary = (
        'mean_voltage' in col_map or 'min_voltage' in col_map or 'discharge_capacity' in col_map
    ) and (time_col is None or len(df_discharges) == df_discharges[cycle_col].nunique())

    diagnostics = observed_diagnostics(df, col_map)

    # Convert cycle to numeric
    df_discharges = df_discharges.copy()
    df_discharges['__Cycle__'] = pd.to_numeric(df_discharges[cycle_col], errors='coerce')
    df_discharges = df_discharges.dropna(subset=['__Cycle__'])
    df_discharges['__Cycle__'] = df_discharges['__Cycle__'].astype(int)

    if time_col and time_col in df_discharges.columns:
        df_discharges['__Time__'] = pd.to_numeric(df_discharges[time_col], errors='coerce')
        # Sort strictly by cycle -> time
        df_discharges = df_discharges.sort_values(by=['__Cycle__', '__Time__'])
    else:
        df_discharges['__Time__'] = np.arange(len(df_discharges))
        df_discharges = df_discharges.sort_values(by=['__Cycle__'])

    unique_cycles = sorted(df_discharges['__Cycle__'].unique())
    if not unique_cycles:
        return {"success": False, "error": "No valid cycles found after numeric filtering."}

    cycle_records = []
    
    if is_cycle_summary:
        for cyc in unique_cycles:
            r = df_discharges[df_discharges['__Cycle__'] == cyc].iloc[-1]
            c_val = float(r[cap_col]) if cap_col and pd.notna(r[cap_col]) else 1.85
            mv = float(r['mean_voltage']) if 'mean_voltage' in col_map and pd.notna(r[col_map['mean_voltage']]) else (float(r[v_meas_col]) if v_meas_col else 3.8)
            minv = float(r['min_voltage']) if 'min_voltage' in col_map and pd.notna(r[col_map['min_voltage']]) else mv - 0.5
            maxv = float(r['max_voltage']) if 'max_voltage' in col_map and pd.notna(r[col_map['max_voltage']]) else mv + 0.3
            vr = maxv - minv
            mi = float(r['mean_current']) if 'mean_current' in col_map and pd.notna(r[col_map['mean_current']]) else (float(r[i_meas_col]) if i_meas_col else -1.5)
            maxi = float(r['max_current']) if 'max_current' in col_map and pd.notna(r[col_map['max_current']]) else abs(mi)
            mt = float(r['mean_temperature']) if 'mean_temperature' in col_map and pd.notna(r[col_map['mean_temperature']]) else (float(r[t_meas_col]) if t_meas_col else 24.0)
            maxt = float(r['max_temperature']) if 'max_temperature' in col_map and pd.notna(r[col_map['max_temperature']]) else mt + 2.0
            dur = float(r['discharge_duration']) if 'discharge_duration' in col_map and pd.notna(r[col_map['discharge_duration']]) else 3600.0
            amb = float(r['ambient_temperature']) if 'ambient_temperature' in col_map and pd.notna(r[col_map['ambient_temperature']]) else mt
            
            re_v = float(r['Re']) if 're' in col_map and pd.notna(r[col_map['re']]) else DEFAULT_IMPEDANCE['Re']
            rct_v = float(r['Rct']) if 'rct' in col_map and pd.notna(r[col_map['rct']]) else DEFAULT_IMPEDANCE['Rct']
            bi_v = float(r['battery_impedance']) if 'battery_impedance' in col_map and pd.notna(r[col_map['battery_impedance']]) else DEFAULT_IMPEDANCE['battery_impedance']
            ri_v = float(r['rectified_impedance']) if 'rectified_impedance' in col_map and pd.notna(r[col_map['rectified_impedance']]) else DEFAULT_IMPEDANCE['rectified_impedance']
            
            cycle_records.append({
                'cycle': int(cyc),
                'capacity': c_val,
                'mean_voltage': mv,
                'min_voltage': minv,
                'max_voltage': maxv,
                'voltage_range': vr,
                'mean_current': mi,
                'max_current': maxi,
                'mean_temperature': mt,
                'max_temperature': maxt,
                'discharge_duration': dur,
                'ambient_temperature': amb,
                'Re': re_v,
                'Rct': rct_v,
                'battery_impedance': bi_v,
                'rectified_impedance': ri_v
            })
    else:
        # Aggregate from raw telemetry
        for cyc in unique_cycles:
            cdf = df_discharges[df_discharges['__Cycle__'] == cyc]
            
            # Find capacity for this cycle (positive valid float)
            cap_val = None
            if cap_col and cap_col in cdf.columns:
                valid_caps = pd.to_numeric(cdf[cap_col], errors='coerce').dropna()
                valid_caps = valid_caps[valid_caps > 0.1]
                if not valid_caps.empty:
                    cap_val = float(valid_caps.iloc[-1])
            
            # If capacity is not provided directly, attempt Coulomb integration if current and time exist
            if cap_val is None:
                if i_meas_col and time_col:
                    i_vals = pd.to_numeric(cdf[i_meas_col], errors='coerce')
                    t_vals = pd.to_numeric(cdf[time_col], errors='coerce')
                    valid_mask = i_vals.notna() & t_vals.notna()
                    if valid_mask.sum() > 1:
                        # Negative current is discharge
                        dis_i = i_vals[valid_mask].abs()
                        dis_t = t_vals[valid_mask]
                        # trapezoidal integration -> Ah
                        cap_val = float(np.trapz(dis_i, dis_t) / 3600.0)
            
            if cap_val is None:
                cap_val = 1.85  # Fallback if no capacity could be extracted

            v_series = pd.to_numeric(cdf[v_meas_col], errors='coerce').dropna() if v_meas_col else pd.Series([3.8])
            i_series = pd.to_numeric(cdf[i_meas_col], errors='coerce').dropna() if i_meas_col else pd.Series([-1.5])
            t_series = pd.to_numeric(cdf[t_meas_col], errors='coerce').dropna() if t_meas_col else pd.Series([25.0])
            tm_series = pd.to_numeric(cdf[time_col], errors='coerce').dropna() if time_col else pd.Series([0.0, 1800.0])

            mv = float(v_series.mean()) if not v_series.empty else 3.8
            minv = float(v_series.min()) if not v_series.empty else 3.2
            maxv = float(v_series.max()) if not v_series.empty else 4.2
            vr = maxv - minv

            mi = float(i_series.mean()) if not i_series.empty else -1.5
            maxi = float(i_series.abs().max()) if not i_series.empty else 2.0

            mt = float(t_series.mean()) if not t_series.empty else 25.0
            maxt = float(t_series.max()) if not t_series.empty else 27.0

            # Discharge duration: duration during active discharge current < -0.05
            dis_rows = cdf[pd.to_numeric(cdf[i_meas_col], errors='coerce') < -0.05] if i_meas_col else cdf
            if time_col and not dis_rows.empty and len(dis_rows) > 1:
                tm_dis = pd.to_numeric(dis_rows[time_col], errors='coerce').dropna()
                duration = float(tm_dis.max() - tm_dis.min()) if not tm_dis.empty else 1800.0
            elif not tm_series.empty and len(tm_series) > 1:
                duration = float(tm_series.max() - tm_series.min())
            else:
                duration = 1800.0

            cycle_records.append({
                'cycle': int(cyc),
                'capacity': cap_val,
                'mean_voltage': mv,
                'min_voltage': minv,
                'max_voltage': maxv,
                'voltage_range': vr,
                'mean_current': mi,
                'max_current': maxi,
                'mean_temperature': mt,
                'max_temperature': maxt,
                'discharge_duration': duration,
                'ambient_temperature': mt,
                'Re': float(df['Re'].iloc[0]) if 're' in col_map and pd.notna(df[col_map['re']].iloc[0]) else DEFAULT_IMPEDANCE['Re'],
                'Rct': float(df['Rct'].iloc[0]) if 'rct' in col_map and pd.notna(df[col_map['rct']].iloc[0]) else DEFAULT_IMPEDANCE['Rct'],
                'battery_impedance': float(df['battery_impedance'].iloc[0]) if 'battery_impedance' in col_map and pd.notna(df[col_map['battery_impedance']].iloc[0]) else DEFAULT_IMPEDANCE['battery_impedance'],
                'rectified_impedance': float(df['rectified_impedance'].iloc[0]) if 'rectified_impedance' in col_map and pd.notna(df[col_map['rectified_impedance']].iloc[0]) else DEFAULT_IMPEDANCE['rectified_impedance']
            })

    cycle_df = pd.DataFrame(cycle_records).sort_values('cycle')
    cycle_count = len(cycle_df)
    first_cycle = int(cycle_df['cycle'].iloc[0])
    latest_cycle = int(cycle_df['cycle'].iloc[-1])

    # SOH Reference Capacity: Initial valid discharge capacity (mean of initial up to 3 valid cycles)
    init_cycles_n = min(3, cycle_count)
    initial_cap = float(cycle_df['capacity'].iloc[:init_cycles_n].mean())
    latest_cap = float(cycle_df['capacity'].iloc[-1])

    empirical_soh = min(100.0, max(0.0, (latest_cap / initial_cap) * 100.0)) if initial_cap > 0 else 100.0

    # Historical degradation points
    historical_points = []
    cycle_sohs = []
    cycles_list = []
    for _, r in cycle_df.iterrows():
        cyc_val = int(r['cycle'])
        cyc_soh = min(100.0, max(0.0, (r['capacity'] / initial_cap) * 100.0)) if initial_cap > 0 else 100.0
        historical_points.append({'cycle': cyc_val, 'soh': round(cyc_soh, 2)})
        cycles_list.append(cyc_val)
        cycle_sohs.append(cyc_soh)

    # Fit linear degradation trend
    slope, intercept, r2, n_cycles_used = fit_linear_degradation(cycles_list, cycle_sohs)
    
    # RUL calculation: scientifically traceable
    # SOH(c) = slope * c + intercept => EOL when SOH = eol_threshold
    rul_cycles = None
    predicted_eol_cycle = None
    rul_status = "insufficient_degradation_history"

    if slope is not None and slope < 0 and cycle_count >= 3:
        target_cycle = int(round((eol_threshold - intercept) / slope))
        predicted_eol_cycle = target_cycle
        if empirical_soh <= eol_threshold:
            rul_cycles = 0
            rul_status = "eol_reached"
        elif target_cycle > latest_cycle:
            rul_cycles = target_cycle - latest_cycle
            rul_status = "extrapolated"
        else:
            rul_cycles = 0
            rul_status = "eol_reached"
    elif empirical_soh <= eol_threshold:
        rul_cycles = 0
        predicted_eol_cycle = latest_cycle
        rul_status = "eol_reached"

    # ML Model Inference (if model files exist)
    model_soh = None
    model_rul = None
    model_name = "Rule-Based Electrochemical Baseline"
    metrics = {"mae": None, "rmse": None, "r2": None}
    soh_uncertainty_std = None

    if os.path.exists(SOH_MODEL_PATH) and os.path.exists(RUL_MODEL_PATH):
        try:
            soh_model = joblib.load(SOH_MODEL_PATH)
            rul_model = joblib.load(RUL_MODEL_PATH)

            latest_row = cycle_df.iloc[-1:].copy()
            latest_row['soh'] = empirical_soh
            latest_row['discharge_capacity'] = latest_cap

            soh_feat_cols = [
                'cycle', 'mean_voltage', 'min_voltage', 'max_voltage', 'voltage_range',
                'mean_current', 'max_current', 'mean_temperature', 'max_temperature',
                'discharge_duration', 'ambient_temperature', 'Re', 'Rct',
                'battery_impedance', 'rectified_impedance'
            ]
            rul_feat_cols = [
                'cycle', 'soh', 'discharge_capacity', 'mean_voltage', 'min_voltage',
                'max_voltage', 'voltage_range', 'mean_temperature', 'max_temperature',
                'discharge_duration', 'ambient_temperature', 'Re', 'Rct'
            ]

            # Model prediction
            pred_soh_raw = float(soh_model.predict(latest_row[soh_feat_cols])[0])
            pred_rul_raw = float(rul_model.predict(latest_row[rul_feat_cols])[0])

            model_soh = round(float(np.clip(pred_soh_raw, 0.0, 100.0)), 1)
            model_rul = max(0, int(round(pred_rul_raw))) if empirical_soh > eol_threshold else 0

            # Compute ensemble uncertainty across trees
            if hasattr(soh_model, 'estimators_'):
                x_vals = latest_row[soh_feat_cols].values
                tree_preds = [float(t.predict(x_vals)[0]) for t in soh_model.estimators_]
                soh_uncertainty_std = round(float(np.std(tree_preds)), 2)

            model_name = "RandomForest (SOH) + GradientBoosting (RUL)"

            if os.path.exists(METADATA_PATH):
                with open(METADATA_PATH) as f:
                    meta = json.load(f)
                    metrics = {
                        'soh_mae': meta['models']['soh']['metrics']['test_mae'],
                        'rul_mae': meta['models']['rul']['metrics']['test_mae'],
                        'soh_r2': meta['models']['soh']['metrics']['test_r2'],
                        'rul_r2': meta['models']['rul']['metrics']['test_r2']
                    }
        except Exception as e:
            print(f"Warning: ML model inference error ({e}), keeping baseline values.", file=sys.stderr)

    # Projected degradation points forward to EOL
    projected_points = []
    rul_for_proj = rul_cycles if rul_cycles is not None else model_rul
    if rul_for_proj is not None and rul_for_proj > 0:
        steps = min(6, max(3, rul_for_proj))
        step_sz = max(1, rul_for_proj // steps)
        for i in range(1, steps + 1):
            f_cyc = latest_cycle + i * step_sz
            f_soh = max(eol_threshold, empirical_soh - (i / steps) * (empirical_soh - eol_threshold))
            projected_points.append({'cycle': f_cyc, 'soh': round(f_soh, 1)})
            if f_soh <= eol_threshold:
                break

    # Construct the truthful structured response
    result = {
        "success": True,
        "dataset": {
            "source": "NASA Battery Experimental Data" if "nasa" in os.path.basename(csv_path).lower() or "b00" in str(battery_id).lower() else "Synthetic Test Data",
            "type": "experimental" if "nasa" in os.path.basename(csv_path).lower() or "b00" in str(battery_id).lower() else "synthetic",
            "batteryId": str(battery_id),
            "availableBatteries": available_batteries,
            "rows": len(df),
            "cycles": cycle_count,
            "firstCycle": first_cycle,
            "latestCycle": latest_cycle
        },
        "soh": {
            "empirical": round(empirical_soh, 1),
            "predicted": model_soh,
            "referenceCapacityAh": round(initial_cap, 4),
            "currentCapacityAh": round(latest_cap, 4),
            "method": "initial_discharge_capacity_ratio"
        },
        "degradation": {
            "slope": round(slope, 4) if slope is not None else None,
            "unit": "percentage_points_per_cycle",
            "r2": round(r2, 4) if r2 is not None else None,
            "cyclesUsed": n_cycles_used
        },
        "rul": {
            "currentCycle": latest_cycle,
            "eolThreshold": eol_threshold,
            "predictedEolCycle": predicted_eol_cycle,
            "rulCycles": rul_cycles,
            "method": "linear_degradation_extrapolation",
            "status": rul_status
        },
        "confidence": {
            "calibrated": False,
            "method": "ensemble_standard_deviation" if soh_uncertainty_std is not None else None,
            "value": None,
            "uncertaintyInterval": f"+/-{soh_uncertainty_std}% SOH" if soh_uncertainty_std is not None else "Unavailable",
            "sohUncertaintyStd": soh_uncertainty_std
        },
        "telemetry": {
            "voltageMin": round(float(cycle_df['min_voltage'].min()), 3) if not cycle_df.empty else None,
            "voltageMax": round(float(cycle_df['max_voltage'].max()), 3) if not cycle_df.empty else None,
            "temperatureMin": round(float(cycle_df['mean_temperature'].min()), 1) if not cycle_df.empty else None,
            "temperatureMax": round(float(cycle_df['max_temperature'].max()), 1) if not cycle_df.empty else None,
            "temperatureMean": round(float(cycle_df['mean_temperature'].mean()), 1) if not cycle_df.empty else None,
        },
        "charts": {
            "historical": historical_points,
            "projected": projected_points,
            "cycleTable": cycle_records
        },
        "model": {
            "name": model_name,
            "version": "1.0.0",
            "algorithm": "RandomForest (SOH) + GradientBoosting (RUL)"
        },
        "metrics": metrics,
        "diagnostics": diagnostics
    }
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="VoltSense Battery ML Predictor")
    parser.add_argument('--file', required=True, help="Path to battery telemetry CSV file")
    parser.add_argument('--eol', type=float, default=70.0, help="EOL SOH threshold percentage")
    parser.add_argument('--battery', type=str, default=None, help="Battery ID to analyze for multi-battery datasets")
    args = parser.parse_args()
    
    res = predict_from_csv(args.file, args.eol, args.battery)
    print(json.dumps(res))
