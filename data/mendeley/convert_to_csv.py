"""
Convert Stanford EV Battery Dataset (.mat files) in Mendeley folder into CSV format.
Generates:
  1. Raw.csv: Complete high-frequency telemetry (~100 Hz, millions of rows)
  2. Raw_1hz.csv: Resampled at 1 Hz for fast ingestion, analysis, and Excel compatibility
"""

import os
import time
from datetime import datetime, timezone
import h5py
import numpy as np
import pandas as pd


def process_folder(folder_path):
    mat_path = os.path.join(folder_path, 'Raw.mat')
    if not os.path.exists(mat_path):
        print(f"Skipping {folder_path}: Raw.mat not found")
        return

    print(f"\n=======================================================")
    print(f"Processing: {mat_path}")
    print(f"=======================================================")
    t0 = time.time()

    with h5py.File(mat_path, 'r') as f:
        raw = f['Raw']
        t_curr = np.array(raw['TimeCurr'][0], dtype=np.float64)
        curr = np.array(raw['Curr'][0], dtype=np.float64)
        volt = np.array(raw['Volt'][0], dtype=np.float64)

        t_temp = np.array(raw['TimeTemp'][0], dtype=np.float64)
        temp_raw = np.array(raw['Temp'][0], dtype=np.float64)
        temp = np.interp(t_curr, t_temp, temp_raw)

        t_soc = np.array(raw['TimeSoC'][0], dtype=np.float64)
        soc_raw = np.array(raw['SoC'][0], dtype=np.float64)
        if len(soc_raw) == len(t_curr) and np.allclose(t_soc, t_curr):
            soc = soc_raw
        else:
            soc = np.interp(t_curr, t_soc, soc_raw)

        t_ep = np.array(raw['TimeEpoch'][0], dtype=np.float64)
        ep = np.array(raw['Epoch'][0], dtype=np.float64)
        base_epoch = ep[0] - (t_ep[0] - t_curr[0])
        epoch = base_epoch + (t_curr - t_curr[0])

    n_rows = len(t_curr)
    elapsed = t_curr - t_curr[0]
    duration_hrs = elapsed[-1] / 3600.0
    print(f"Loaded {n_rows:,} records spanning {duration_hrs:.2f} hours in {time.time() - t0:.2f}s")

    # 1. Generate 1 Hz Downsampled CSV
    print("Generating 1 Hz downsampled dataset (Raw_1hz.csv)...")
    t1 = time.time()
    # Step at roughly 1 second intervals
    step_1s = int(round(1.0 / (np.median(np.diff(t_curr[:1000])))))
    idx_1hz = np.arange(0, n_rows, step_1s)

    ts_1hz = [
        datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')[:-4] + 'Z'
        for ts in epoch[idx_1hz]
    ]

    df_1hz = pd.DataFrame({
        'timestamp': ts_1hz,
        'time': np.round(elapsed[idx_1hz], 3),
        'voltage': np.round(volt[idx_1hz], 2),
        'current': np.round(curr[idx_1hz], 2),
        'temperature': np.round(temp[idx_1hz], 2),
        'soc': np.round(soc[idx_1hz], 2),
        'epoch': np.round(epoch[idx_1hz], 3)
    })

    out_1hz = os.path.join(folder_path, 'Raw_1hz.csv')
    df_1hz.to_csv(out_1hz, index=False)
    size_1hz_mb = os.path.getsize(out_1hz) / (1024 * 1024)
    print(f"Saved {out_1hz}: {len(df_1hz):,} rows, {size_1hz_mb:.2f} MB in {time.time() - t1:.2f}s")

    # 2. Generate Full Resolution CSV
    print(f"Generating full-resolution dataset (Raw.csv, {n_rows:,} rows)...")
    t2 = time.time()
    out_full = os.path.join(folder_path, 'Raw.csv')

    # To write ISO timestamps efficiently for millions of rows:
    # Use vectorized epoch formatting in chunks
    chunk_size = 500000
    with open(out_full, 'w', encoding='utf-8', newline='') as f_out:
        f_out.write('timestamp,time,voltage,current,temperature,soc,epoch\n')
        for i in range(0, n_rows, chunk_size):
            end_i = min(i + chunk_size, n_rows)
            chunk_epoch = epoch[i:end_i]
            chunk_ts = [
                datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')[:-4] + 'Z'
                for ts in chunk_epoch
            ]
            chunk_df = pd.DataFrame({
                'timestamp': chunk_ts,
                'time': np.round(elapsed[i:end_i], 3),
                'voltage': np.round(volt[i:end_i], 2),
                'current': np.round(curr[i:end_i], 2),
                'temperature': np.round(temp[i:end_i], 2),
                'soc': np.round(soc[i:end_i], 2),
                'epoch': np.round(chunk_epoch, 3)
            })
            chunk_df.to_csv(f_out, header=False, index=False)
            print(f"  Written {end_i:,} / {n_rows:,} rows ({(end_i/n_rows)*100:.1f}%)")

    size_full_mb = os.path.getsize(out_full) / (1024 * 1024)
    print(f"Saved {out_full}: {n_rows:,} rows, {size_full_mb:.2f} MB in {time.time() - t2:.2f}s")
    print(f"Folder processing complete in {time.time() - t0:.2f}s\n")


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    folders = [
        os.path.join(base_dir, 'Charge', 'Folder1'),
        os.path.join(base_dir, 'Charge', 'Folder11'),
    ]

    for f in folders:
        if os.path.isdir(f):
            process_folder(f)

    print("All Mendeley .mat datasets successfully converted to CSV in their respective folders!")


if __name__ == '__main__':
    main()
