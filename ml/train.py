import os
import json
import joblib
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'nasa_battery_cycles.csv')
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
RESULTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'evaluation_results.json')
METADATA_PATH = os.path.join(MODEL_DIR, 'model_metadata.json')

SOH_FEATURES = [
    'cycle',
    'mean_voltage',
    'min_voltage',
    'max_voltage',
    'voltage_range',
    'mean_current',
    'max_current',
    'mean_temperature',
    'max_temperature',
    'discharge_duration',
    'ambient_temperature',
    'Re',
    'Rct',
    'battery_impedance',
    'rectified_impedance'
]

RUL_FEATURES = [
    'cycle',
    'soh',
    'discharge_capacity',
    'mean_voltage',
    'min_voltage',
    'max_voltage',
    'voltage_range',
    'mean_temperature',
    'max_temperature',
    'discharge_duration',
    'ambient_temperature',
    'Re',
    'Rct'
]

# Group split by battery ID to strictly prevent temporal cycle leakage
TEST_BATTERIES = ['B0007', 'B0018', 'B0042', 'B0048']

def train_and_evaluate():
    print("=" * 60)
    print("VoltSense ML Model Training Pipeline (NASA Li-ion Dataset)")
    print("=" * 60)
    
    os.makedirs(MODEL_DIR, exist_ok=True)
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} cycles across {df['battery_id'].nunique()} batteries.")
    
    train_mask = ~df['battery_id'].isin(TEST_BATTERIES)
    test_mask = df['battery_id'].isin(TEST_BATTERIES)
    
    train_df = df[train_mask]
    test_df = df[test_mask]
    
    print(f"Training set: {len(train_df)} cycles ({train_df['battery_id'].nunique()} batteries)")
    print(f"Held-out test set: {len(test_df)} cycles ({list(test_df['battery_id'].unique())})")
    print("-" * 60)
    
    # -------------------------------------------------------------
    # 1. SOH Model Training
    # -------------------------------------------------------------
    print("Training SOH Regressor...")
    X_train_soh = train_df[SOH_FEATURES]
    y_train_soh = train_df['soh']
    X_test_soh = test_df[SOH_FEATURES]
    y_test_soh = test_df['soh']
    
    soh_model = RandomForestRegressor(
        n_estimators=120,
        max_depth=14,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    soh_model.fit(X_train_soh, y_train_soh)
    
    soh_pred_train = soh_model.predict(X_train_soh)
    soh_pred_test = soh_model.predict(X_test_soh)
    
    soh_metrics = {
        'train_mae': float(mean_absolute_error(y_train_soh, soh_pred_train)),
        'train_rmse': float(np.sqrt(mean_squared_error(y_train_soh, soh_pred_train))),
        'train_r2': float(r2_score(y_train_soh, soh_pred_train)),
        'test_mae': float(mean_absolute_error(y_test_soh, soh_pred_test)),
        'test_rmse': float(np.sqrt(mean_squared_error(y_test_soh, soh_pred_test))),
        'test_r2': float(r2_score(y_test_soh, soh_pred_test))
    }
    
    print(f"SOH Test Evaluation: MAE = {soh_metrics['test_mae']:.3f}%, RMSE = {soh_metrics['test_rmse']:.3f}%, R2 = {soh_metrics['test_r2']:.4f}")
    
    # -------------------------------------------------------------
    # 2. RUL Model Training
    # -------------------------------------------------------------
    print("\nTraining RUL Regressor...")
    X_train_rul = train_df[RUL_FEATURES]
    y_train_rul = train_df['rul']
    X_test_rul = test_df[RUL_FEATURES]
    y_test_rul = test_df['rul']
    
    rul_model = GradientBoostingRegressor(
        n_estimators=150,
        learning_rate=0.08,
        max_depth=5,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42
    )
    rul_model.fit(X_train_rul, y_train_rul)
    
    rul_pred_train = rul_model.predict(X_train_rul)
    rul_pred_test = rul_model.predict(X_test_rul)
    
    rul_metrics = {
        'train_mae': float(mean_absolute_error(y_train_rul, rul_pred_train)),
        'train_rmse': float(np.sqrt(mean_squared_error(y_train_rul, rul_pred_train))),
        'train_r2': float(r2_score(y_train_rul, rul_pred_train)),
        'test_mae': float(mean_absolute_error(y_test_rul, rul_pred_test)),
        'test_rmse': float(np.sqrt(mean_squared_error(y_test_rul, rul_pred_test))),
        'test_r2': float(r2_score(y_test_rul, rul_pred_test))
    }
    
    print(f"RUL Test Evaluation: MAE = {rul_metrics['test_mae']:.2f} cycles, RMSE = {rul_metrics['test_rmse']:.2f} cycles, R2 = {rul_metrics['test_r2']:.4f}")
    
    # -------------------------------------------------------------
    # 3. Save Artifacts
    # -------------------------------------------------------------
    soh_model_file = os.path.join(MODEL_DIR, 'soh_model.joblib')
    rul_model_file = os.path.join(MODEL_DIR, 'rul_model.joblib')
    
    joblib.dump(soh_model, soh_model_file)
    joblib.dump(rul_model, rul_model_file)
    print(f"\nSaved SOH model to: {soh_model_file}")
    print(f"Saved RUL model to: {rul_model_file}")
    
    metadata = {
        'dataset': 'NASA Randomized Li-ion Battery Aging Dataset (B0005-B0056)',
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'eol_soh_threshold': 70.0,
        'train_batteries_count': int(train_df['battery_id'].nunique()),
        'test_batteries': TEST_BATTERIES,
        'total_cycles': int(len(df)),
        'models': {
            'soh': {
                'algorithm': 'RandomForestRegressor',
                'version': '1.0.0',
                'features': SOH_FEATURES,
                'metrics': soh_metrics
            },
            'rul': {
                'algorithm': 'GradientBoostingRegressor',
                'version': '1.0.0',
                'features': RUL_FEATURES,
                'metrics': rul_metrics
            }
        }
    }
    
    with open(METADATA_PATH, 'w') as f:
        json.dump(metadata, f, indent=2)
    with open(RESULTS_PATH, 'w') as f:
        json.dump(metadata, f, indent=2)
        
    print(f"Saved model metadata to: {METADATA_PATH}")
    print(f"Saved evaluation results to: {RESULTS_PATH}")
    print("=" * 60)
    return metadata

if __name__ == '__main__':
    train_and_evaluate()
