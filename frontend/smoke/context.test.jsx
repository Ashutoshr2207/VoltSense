// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '../src/context/AppContext';

const mocks = vi.hoisted(() => ({ vehicles: vi.fn(), predictions: vi.fn() }));
vi.mock('../src/api/authApi', () => ({ getCurrentUser: async () => ({ name: 'Test', email: 'test@example.invalid' }) }));
vi.mock('../src/api/vehicleApi', () => ({ fetchVehicles: (...args) => mocks.vehicles(...args) }));
vi.mock('../src/api/predictionApi', () => ({ fetchPredictionsForVehicle: (...args) => mocks.predictions(...args) }));
vi.mock('../src/api/notificationApi', () => ({ fetchNotifications: async () => ({ notifications: [], unreadCount: 0 }) }));

function Probe() {
  const app = useApp();
  const [detailError, setDetailError] = useState('');
  return <div>
    <p>{app.authChecked && app.isAuthenticated ? 'Session ready' : 'Loading session'}</p>
    <p>{app.predictionsError || 'No history error'}</p><p>{app.vehiclesError}</p><p>{detailError}</p>
    <button onClick={() => app.refreshPredictions()}>Retry history</button>
    <button onClick={async () => { try { await app.loadVehicleDetail('v1'); } catch (err) { setDetailError(err.message); } }}>Read detail</button>
  </div>;
}
beforeEach(() => {
  localStorage.setItem('voltsense_token', 'test-session');
  mocks.vehicles.mockResolvedValue({ vehicles: [{ id: 'v1', nickname: 'Test EV' }] });
  mocks.predictions.mockResolvedValue({ predictions: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); });

test('history transport error is exposed, retry clears it, and detail failure propagates', async () => {
  mocks.predictions.mockRejectedValueOnce(new Error('Disconnected'));
  render(<AppProvider><Probe /></AppProvider>);
  await screen.findByText('Session ready');
  await screen.findByText(/displayed records may be incomplete/);
  fireEvent.click(screen.getByText('Retry history'));
  await screen.findByText('No history error');
  mocks.predictions.mockRejectedValueOnce(new Error('Detail unavailable'));
  fireEvent.click(screen.getByText('Read detail'));
  await screen.findByText('Detail unavailable');
});

test('vehicle fetch failure is visible without destroying a valid session', async () => {
  mocks.vehicles.mockRejectedValueOnce(new Error('Vehicle list unavailable'));
  render(<AppProvider><Probe /></AppProvider>);
  await screen.findByText('Session ready');
  await screen.findByText('Vehicle list unavailable');
  expect(localStorage.getItem('voltsense_token')).toBe('test-session');
});

test('repeated loadVehicleDetail on navigation never compounds or increases RUL', async () => {
  localStorage.setItem('vs_eol_threshold', '70');
  mocks.vehicles.mockResolvedValue({ vehicles: [{ id: 'v1', nickname: 'Test EV', latestSOH: 95.0, latestRUL: 300, currentCycleCount: 30 }] });
  mocks.predictions.mockResolvedValue({ predictions: [{ id: 'p1', prediction: { soh: 95.0, rulCycles: 300, eolThreshold: 80 } }] });

  let currentRul = null;
  function RulProbe() {
    const { activeVehicle, loadVehicleDetail } = useApp();
    currentRul = activeVehicle?.rul;
    return <button onClick={() => loadVehicleDetail('v1')}>Navigate</button>;
  }

  try {
    render(<AppProvider><RulProbe /></AppProvider>);
    await screen.findByText('Navigate');
    await waitFor(() => expect(currentRul).toBe(500));

    const callsBefore = mocks.predictions.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText('Navigate'));
    }
    await waitFor(() => expect(mocks.predictions.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 5));
    expect(currentRul).toBe(500);
  } finally {
    localStorage.removeItem('vs_eol_threshold');
  }
});
