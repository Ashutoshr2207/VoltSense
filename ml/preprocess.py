import os
import zipfile
import pandas as pd
import numpy as np

ZIP_PATH = os.environ.get('NASA_ARCHIVE_PATH', r'C:\Users\HP\Downloads\archive.zip')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'nasa_battery_cycles.csv')
EOL_SOH_THRESHOLD = 70.0

def safe_eval_complex(val):
    if pd.isna(val):
        return np.nan
    try:
        val_str = str(val).strip()
        if val_str.startswith('(') and val_str.endswith(')'):
            val_str = val_str[1:-1]
        c = complex(val_str)
        return abs(c)
    except Exception:
        return np.nan

def preprocess_nasa_dataset():
    print(f"Loading NASA Li-ion battery dataset from: {ZIP_PATH}")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    with zipfile.ZipFile(ZIP_PATH, 'r') as z:
        with z.open('cleaned_dataset/metadata.csv') as mf:
            meta = pd.read_csv(mf)
            
        meta['Capacity'] = pd.to_numeric(meta['Capacity'], errors='coerce')
        meta['Re'] = pd.to_numeric(meta['Re'], errors='coerce')
        meta['Rct'] = pd.to_numeric(meta['Rct'], errors='coerce')
        meta['ambient_temperature'] = pd.to_numeric(meta['ambient_temperature'], errors='coerce')
        
        # Sort metadata by battery_id and start_time / index to preserve temporal order
        meta = meta.reset_index().rename(columns={'index': 'meta_index'})
        
        # Select batteries with meaningful degradation traces
        batteries = meta['battery_id'].dropna().unique()
        
        all_cycle_records = []
        
        for battery_id in batteries:
            b_meta = meta[meta['battery_id'] == battery_id].sort_values('meta_index')
            discharges = b_meta[b_meta['type'] == 'discharge'].copy()
            impedances = b_meta[b_meta['type'] == 'impedance'].copy()
            
            # Filter valid capacities (between 0.4 and 3.0 Ah)
            discharges = discharges[(discharges['Capacity'] > 0.4) & (discharges['Capacity'] < 3.0)]
            if len(discharges) < 5:
                continue
                
            c0 = discharges['Capacity'].iloc[0]
            if c0 <= 0:
                continue
                
            # Assign sequential cycle numbers 1..N
            discharges['cycle'] = np.arange(1, len(discharges) + 1)
            discharges['soh'] = (discharges['Capacity'] / c0) * 100.0
            
            # Determine EOL cycle (where SOH <= EOL_SOH_THRESHOLD)
            eol_rows = discharges[discharges['soh'] <= EOL_SOH_THRESHOLD]
            if not eol_rows.empty:
                eol_cycle = eol_rows['cycle'].iloc[0]
            else:
                # Linear extrapolation to EOL cycle if not reached
                first_c = discharges['Capacity'].iloc[0]
                last_c = discharges['Capacity'].iloc[-1]
                total_cyc = len(discharges)
                slope = (last_c - first_c) / total_cyc if total_cyc > 1 else -0.005
                if slope < 0:
                    needed_drop = (c0 * (EOL_SOH_THRESHOLD / 100.0)) - last_c
                    extra_cyc = abs(needed_drop / slope)
                    eol_cycle = int(round(total_cyc + extra_cyc))
                else:
                    eol_cycle = total_cyc + 50
                    
            # Latest impedance tracker
            latest_re = np.nan
            latest_rct = np.nan
            latest_bat_imp = np.nan
            latest_rect_imp = np.nan
            
            # Walk operations to associate impedance with subsequent discharge
            for _, row in discharges.iterrows():
                row_idx = row['meta_index']
                cycle_num = int(row['cycle'])
                cap = float(row['Capacity'])
                soh = float(row['soh'])
                amb_temp = float(row['ambient_temperature']) if pd.notna(row['ambient_temperature']) else 24.0
                
                # Check impedance preceding this discharge
                pre_imp = impedances[impedances['meta_index'] < row_idx]
                if not pre_imp.empty:
                    last_imp_row = pre_imp.iloc[-1]
                    latest_re = float(last_imp_row['Re']) if pd.notna(last_imp_row['Re']) else latest_re
                    latest_rct = float(last_imp_row['Rct']) if pd.notna(last_imp_row['Rct']) else latest_rct
                    
                    # Optionally extract impedance values from CSV
                    imp_fname = 'cleaned_dataset/data/' + str(last_imp_row['filename'])
                    try:
                        with z.open(imp_fname) as icf:
                            idf = pd.read_csv(icf, nrows=10)
                            if 'Battery_impedance' in idf.columns:
                                val = safe_eval_complex(idf['Battery_impedance'].iloc[0])
                                if pd.notna(val): latest_bat_imp = val
                            if 'Rectified_Impedance' in idf.columns:
                                val = safe_eval_complex(idf['Rectified_Impedance'].iloc[0])
                                if pd.notna(val): latest_rect_imp = val
                    except Exception:
                        pass
                
                # Read cycle discharge CSV
                dis_fname = 'cleaned_dataset/data/' + str(row['filename'])
                mean_v, min_v, max_v, v_range = np.nan, np.nan, np.nan, np.nan
                mean_i, max_i = np.nan, np.nan
                mean_t, max_t = np.nan, np.nan
                duration = np.nan
                
                try:
                    with z.open(dis_fname) as dcf:
                        ddf = pd.read_csv(dcf)
                        if 'Voltage_measured' in ddf.columns:
                            v = pd.to_numeric(ddf['Voltage_measured'], errors='coerce').dropna()
                            if not v.empty:
                                mean_v = float(v.mean())
                                min_v = float(v.min())
                                max_v = float(v.max())
                                v_range = max_v - min_v
                        if 'Current_measured' in ddf.columns:
                            cur = pd.to_numeric(ddf['Current_measured'], errors='coerce').dropna()
                            if not cur.empty:
                                mean_i = float(cur.mean())
                                max_i = float(cur.abs().max())
                        if 'Temperature_measured' in ddf.columns:
                            t = pd.to_numeric(ddf['Temperature_measured'], errors='coerce').dropna()
                            if not t.empty:
                                mean_t = float(t.mean())
                                max_t = float(t.max())
                        if 'Time' in ddf.columns:
                            tm = pd.to_numeric(ddf['Time'], errors='coerce').dropna()
                            if not tm.empty:
                                duration = float(tm.max() - tm.min())
                except Exception as err:
                    print(f"Warning reading {dis_fname}: {err}")
                    
                rul = max(0, eol_cycle - cycle_num)
                
                all_cycle_records.append({
                    'battery_id': battery_id,
                    'cycle': cycle_num,
                    'discharge_capacity': cap,
                    'initial_capacity': c0,
                    'soh': soh,
                    'rul': rul,
                    'eol_cycle': eol_cycle,
                    'mean_voltage': mean_v,
                    'min_voltage': min_v,
                    'max_voltage': max_v,
                    'voltage_range': v_range,
                    'mean_current': mean_i,
                    'max_current': max_i,
                    'mean_temperature': mean_t,
                    'max_temperature': max_t,
                    'discharge_duration': duration,
                    'ambient_temperature': amb_temp,
                    'Re': latest_re,
                    'Rct': latest_rct,
                    'battery_impedance': latest_bat_imp,
                    'rectified_impedance': latest_rect_imp
                })
                
    df_out = pd.DataFrame(all_cycle_records)
    print(f"Extracted {len(df_out)} cycle records across {df_out['battery_id'].nunique()} batteries.")
    
    # Fill remaining NaNs for model friendliness (e.g. impedance using battery forward-fill / medians)
    imp_cols = ['Re', 'Rct', 'battery_impedance', 'rectified_impedance']
    for col in imp_cols:
        df_out[col] = df_out.groupby('battery_id')[col].ffill().bfill()
        df_out[col] = df_out[col].fillna(df_out[col].median())
        
    df_out.to_csv(OUTPUT_FILE, index=False)
    print(f"Saved preprocessed dataset to: {OUTPUT_FILE}")
    return df_out

if __name__ == '__main__':
    preprocess_nasa_dataset()
