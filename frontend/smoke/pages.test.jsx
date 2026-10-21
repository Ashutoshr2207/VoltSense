// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const cycleTable = Array.from({ length: 40 }, (_, i) => ({ cycle: i + 1, capacity: 2 - i * 0.004, meanTemperature: 26 + i * 0.05, meanVoltage: 3.7 }));
const full = { id: 'v1', name: 'My EV', manufacturer: '', model: '', year: '—', soh: 87.4, rul: 33, cycles: 40, hasAnalysis: true, mlStatus: 'connected', eolThreshold: 80,
  cycleTable, degradation: { historical: cycleTable.map((c) => ({ cycle: c.cycle, soh: (c.capacity / 2) * 100 })), predicted: [] },
  referenceCapacityAh: 2, currentCapacityAh: 1.844, timeShare: { chargePercent: 30 }, soc: 55, telemetryStats: { temperature: { mean: 27 } },
  chargingSessions: [{ cycle: 3, durationMin: 42, startSoc: 20, endSoc: 80, energyKWh: 0.4 }], recommendations: ['Keep it cool'], factors: [],
  analysisAt: new Date().toISOString(), datasetSourceLabel: 'Uploaded file', datasetSourceDetail: 'a.csv', lastBatch: 'today', capacityKWh: null };
const empty = { id: 'v2', name: 'New EV', soh: null, rul: null, cycles: null, hasAnalysis: false, year: '—', lastBatch: 'never' };
let current = full;
vi.mock('../src/context/AppContext', () => ({ useApp: () => ({
  currentUser: { name: 'Test User' }, vehicles: [current], activeVehicle: current, selectedVehicleId: current.id, vehiclesLoading: false,
  predictions: [{ id: 'p1234567', vehicleId: current.id, vehicleName: current.name, measuredSoh: 87.4, rulCycles: 33, status: 'Attention', timestamp: 'now', timestampRaw: new Date().toISOString(), measurementDate: '2025-01-15' }],
  notifications: [], setCurrentTab: () => {}, setIsAddVehicleModalOpen: () => {}, setSelectedVehicleId: () => {}, loadVehicleDetail: async () => {},
  refreshVehicles: async () => [current], addPrediction: () => {} }) }));
vi.mock('../src/api/datasetApi', () => ({ fetchDatasetsForVehicle: async () => ({ datasets: [{ uploadedAt: new Date().toISOString(), originalFileName: 'a.csv', recordCount: 1000 }] }),
  uploadDataset: vi.fn(), triggerProcessing: vi.fn(), getProcessingStatus: vi.fn(), deleteDataset: vi.fn() }));
vi.mock('../src/api/predictionApi', () => ({ fetchPredictionById: async () => ({ id: 'p1234567', createdAt: new Date().toISOString(), prediction: { soh: 87.4 }, degradation: { historical: [] } }),
  fetchInsightsForPrediction: async () => null, fetchPredictionsForVehicle: async () => ({ predictions: [] }) }));
vi.mock('../src/api/vehicleApi', () => ({ updateVehicle: vi.fn(), deleteVehicle: vi.fn() }));
vi.mock('../src/pages/ChargingMap', () => ({ default: () => <div>map</div> }));

import Dashboard from '../src/pages/Dashboard';
import BatteryHealth from '../src/pages/BatteryHealth';
import DataIngestion from '../src/pages/DataIngestion';
import Insights from '../src/pages/Insights';
import Charging from '../src/pages/Charging';
import Vehicle from '../src/pages/Vehicle';

const pages = { Dashboard, BatteryHealth, DataIngestion, Insights, Charging, Vehicle };
for (const [name, Page] of Object.entries(pages)) {
  for (const [label, v] of [['with data', full], ['empty', empty]]) {
    it(`${name} renders ${label}`, async () => {
      current = v; cleanup();
      const { container } = render(<Page />);
      await waitFor(() => expect(container.textContent.length).toBeGreaterThan(20));
      const t = container.textContent;
      expect(t).not.toMatch(/NaN|undefined|\[object/);
      if (label === 'empty' && name !== 'Vehicle' && name !== 'Charging') expect(t).not.toMatch(/\b0%/);
    });
  }
}
