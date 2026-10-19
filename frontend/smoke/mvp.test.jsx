// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import apiRequest from '../src/api/api';
import DatasetStatusPanel from '../src/components/common/DatasetStatusPanel';
import Dashboard from '../src/pages/Dashboard';
import BatteryHealth from '../src/pages/BatteryHealth';
import AddVehicleModal from '../src/components/common/AddVehicleModal';
import Insights from '../src/pages/Insights';
import useVehicleDetail from '../src/hooks/useVehicleDetail';

const mocks = vi.hoisted(() => ({ app: {}, status: vi.fn(), datasets: vi.fn() }));
vi.mock('../src/context/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('../src/api/datasetApi', () => ({ getProcessingStatus: (...args) => mocks.status(...args),
  fetchDatasetsForVehicle: (...args) => mocks.datasets(...args), uploadDataset: vi.fn(),
  triggerProcessing: vi.fn(), waitForProcessing: vi.fn() }));
vi.mock('../src/components/dashboard/VehicleBattery3D', () => ({ default: () => <div>Illustrative battery</div> }));

const dataset = { id: 'd1', originalFileName: 'synthetic-demo.csv', status: 'failed', recordCount: 40, cycleCount: 40 };
const failed = (reason) => ({ datasetId: 'd1', status: 'failed', pipelineRun: { id: 'r1', status: 'failed',
  errors: ['ML inference unavailable: ' + reason], stages: { validation: { status: 'completed' }, featureEngineering: { status: 'failed' } } } });

beforeEach(() => {
  mocks.app = { currentUser: { name: 'Test' }, vehicles: [], activeVehicle: null, vehiclesLoading: false,
    predictions: [], notifications: [], loadVehicleDetail: vi.fn().mockResolvedValue(),
    setIsAddVehicleModalOpen: vi.fn(), setCurrentTab: vi.fn(), refreshVehicles: vi.fn(),
    addVehicle: vi.fn().mockResolvedValue(), isAddVehicleModalOpen: true };
  mocks.datasets.mockResolvedValue({ datasets: [] });
  mocks.status.mockResolvedValue(failed('service_error_503:MODEL_UNAVAILABLE'));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

test('dashboard survives no-vehicle -> first vehicle -> no-vehicle without changing hook order', async () => {
  const view = render(<Dashboard />);
  await screen.findByText('Add your vehicle to get started');
  const vehicle = { id: 'v1', name: 'Synthetic demo', hasAnalysis: false };
  mocks.app = { ...mocks.app, vehicles: [vehicle], activeVehicle: vehicle };
  view.rerender(<Dashboard />);
  await waitFor(() => expect(mocks.datasets).toHaveBeenCalledWith('v1'));
  mocks.app = { ...mocks.app, vehicles: [], activeVehicle: null };
  view.rerender(<Dashboard />);
  await screen.findByText('Add your vehicle to get started');
});

test('saved model failure and stages survive remount without selecting or uploading a file', async () => {
  const view = render(<DatasetStatusPanel dataset={dataset} />);
  await screen.findByText(/Model predictions unavailable/);
  expect(screen.getByText('validation: completed')).toBeTruthy();
  view.unmount();
  render(<DatasetStatusPanel dataset={dataset} />);
  await screen.findByText(/Model predictions unavailable/);
  expect(mocks.status).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/service_error_503:MODEL_UNAVAILABLE/)).toBeTruthy();
});

test.each(['unreachable', 'timeout', 'invalid_json', 'service_error_422:INVALID_ML_INPUT'])(
  'communication/input failure %s is not mislabeled as a missing model', async (reason) => {
    mocks.status.mockResolvedValue(failed(reason));
    render(<DatasetStatusPanel dataset={dataset} />);
    await screen.findByText('ML inference unavailable: ' + reason);
    expect(screen.queryByText(/no approved model is available/)).toBeNull();
  });

test('saved-status fetch failure supports retry and never reports success', async () => {
  mocks.status.mockRejectedValueOnce(new Error('Network unavailable'));
  render(<DatasetStatusPanel dataset={dataset} />);
  await screen.findByText('Network unavailable');
  expect(screen.queryByText(/Processing attempt:/)).toBeNull();
  fireEvent.click(screen.getByText('Refresh saved status'));
  await screen.findByText(/Model predictions unavailable/);
});

test('another attempt cannot replace the initiated run status', async () => {
  mocks.status.mockResolvedValue({ status: 'processed', pipelineRun: { id: 'r2', status: 'completed' } });
  render(<DatasetStatusPanel dataset={dataset} pipelineRunId="r1" />);
  await screen.findByText(/different processing attempt/);
  expect(screen.queryByText(/Processing attempt:/)).toBeNull();
});

test('refresh resumes reading a queued run and stops at a persisted failure', async () => {
  let resolveNext;
  mocks.status.mockResolvedValueOnce({ status: 'processing', pipelineRun: { id: 'r1', status: 'queued' } })
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
  const view = render(<DatasetStatusPanel dataset={{ ...dataset, status: 'processing' }} />);
  await screen.findByText('queued');
  await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2), { timeout: 2500 });
  await act(async () => resolveNext(failed('service_error_503:MODEL_UNAVAILABLE')));
  await screen.findByText(/Model predictions unavailable/);
  view.unmount();
});

test('SOH page asks for vehicle setup rather than leaving upload silently disabled', async () => {
  render(<BatteryHealth />);
  await screen.findByText('Add a vehicle before uploading');
  fireEvent.click(screen.getByText('Add vehicle'));
  expect(mocks.app.setIsAddVehicleModalOpen).toHaveBeenCalledWith(true);
});

test('vehicle-detail rejection reaches the hook error state', async () => {
  mocks.app.activeVehicle = { id: 'v1' };
  mocks.app.loadVehicleDetail.mockRejectedValue(new Error('API unavailable'));
  function Probe() { const { error } = useVehicleDetail(); return <div>{error ? 'Load failed' : 'Waiting'}</div>; }
  render(<Probe />);
  await screen.findByText('Load failed');
});

test('history fetch failure is not displayed as an empty successful history', async () => {
  mocks.app = { ...mocks.app, predictionsError: 'Could not load prediction history.', refreshPredictions: vi.fn() };
  render(<Insights initialTab="analyses" />);
  await screen.findByText('Could not load prediction history.');
  expect(screen.queryByText('No battery analysis records found')).toBeNull();
  fireEvent.click(screen.getByText('Try again'));
  expect(mocks.app.refreshPredictions).toHaveBeenCalledTimes(1);
});

test('vehicle setup submits no invented pack capacity or SOH', async () => {
  render(<AddVehicleModal />);
  fireEvent.change(screen.getByPlaceholderText('e.g. My EV'), { target: { value: 'Synthetic cycle demo' } });
  expect(screen.getByPlaceholderText('e.g. 75.0').value).toBe('');
  fireEvent.click(screen.getByText('Set Up My EV'));
  await waitFor(() => expect(mocks.app.addVehicle).toHaveBeenCalledWith(expect.objectContaining({
    nickname: 'Synthetic cycle demo', batteryCapacityKWh: undefined, latestSOH: undefined,
  })));
});

test('API connection and HTML response failures have actionable messages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(apiRequest('/vehicles')).rejects.toThrow('Cannot reach the VoltSense API');
  fetch.mockResolvedValue({ status: 502, ok: false, json: async () => { throw new SyntaxError('HTML'); } });
  await expect(apiRequest('/vehicles')).rejects.toThrow('unexpected response (HTTP 502)');
});

test('401 clears the token even if the response is malformed', async () => {
  localStorage.setItem('voltsense_token', 'expired');
  const unauthorized = vi.fn();
  window.addEventListener('voltsense:unauthorized', unauthorized);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => { throw new Error('bad JSON'); } }));
  await expect(apiRequest('/auth/me')).rejects.toThrow('unexpected response');
  expect(localStorage.getItem('voltsense_token')).toBeNull();
  expect(unauthorized).toHaveBeenCalledTimes(1);
  window.removeEventListener('voltsense:unauthorized', unauthorized);
});
