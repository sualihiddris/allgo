import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TripTrackingScreen from '../app/(main)/trip-tracking';
import { useBookingStore } from '../store/bookingStore';
import bookingService from '../services/booking';
import { socketService } from '../services/socket';

jest.mock('../services/booking', () => ({ __esModule: true, default: { getTrip: jest.fn() } }));
jest.mock('../services/socket', () => ({ socketService: {
  connect: jest.fn(async () => ({})), disconnect: jest.fn(), dispatchTrip: jest.fn(), startTracking: jest.fn(),
  onTripAccepted: jest.fn(() => jest.fn()), onTripNoDrivers: jest.fn(() => jest.fn()),
  onTripFailed: jest.fn(() => jest.fn()), onTripStatus: jest.fn(() => jest.fn()),
  onDriverLocation: jest.fn(() => jest.fn()),
} }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), back: jest.fn() }), Redirect: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => require('../constants/config').COLORS }));

const trip = { id: 'trip-1', status: 'REQUESTED', dispatchStatus: 'SEARCHING' as const,
  vehicleType: 'MOTO' as const, serviceType: 'PASSENGER' as const,
  pickup: { lat: 8, lng: 0, address: 'Pickup' }, destination: { lat: 8.1, lng: 0, address: 'Destination' },
};
const getTrip = bookingService.getTrip as jest.Mock;
describe('Durable dispatch recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks(); getTrip.mockReset();
    getTrip.mockResolvedValue(trip);
    useBookingStore.setState({ currentTrip: trip, isRecoveredRequestedTrip: true });
  });
  afterEach(() => { jest.useRealTimers(); });

  it.each(['NO_DRIVER_FOUND', 'FAILED'])('recovers %s when the terminal socket event was missed', async status => {
    render(<TripTrackingScreen />); await act(async () => {});
    getTrip.mockResolvedValue({ ...trip, dispatchStatus: status });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(screen.queryByText('Finding a nearby driver')).toBeNull();
    expect(screen.getByText(status === 'FAILED' ? "We couldn't contact drivers" : 'No driver accepted this trip')).toBeTruthy();
  });

  it.each(['NO_DRIVER_FOUND', 'FAILED'])('restores persisted %s without automatically retrying it', async status => {
    useBookingStore.setState({ currentTrip: { ...trip, dispatchStatus: status as any } });
    getTrip.mockResolvedValue({ ...trip, dispatchStatus: status });
    render(<TripTrackingScreen />); await act(async () => {});
    expect(socketService.dispatchTrip).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Search Again'));
    expect(socketService.dispatchTrip).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Finding a nearby driver')).toBeTruthy();
  });

  it('recovers assignment from durable state without an accepted socket event', async () => {
    render(<TripTrackingScreen />); await act(async () => {});
    getTrip.mockResolvedValue({ ...trip, status: 'ACCEPTED', dispatchStatus: null,
      driver: { id: 'driver', user: { name: 'Test Driver', phone: 'test' }, vehicleType: 'MOTO', licensePlate: 'test' } });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(screen.getByText('Driver is on the way')).toBeTruthy();
  });

  it.each(['SEARCHING', null])('reattaches unfinished %s searches through the existing dispatch claim', async status => {
    getTrip.mockResolvedValue({ ...trip, dispatchStatus: status });
    render(<TripTrackingScreen />); await act(async () => {});
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(socketService.dispatchTrip).toHaveBeenCalledWith('trip-1');
  });

  it('bounds stalled reads, avoids overlap, and cleans up on unmount', async () => {
    getTrip.mockReturnValue(new Promise(() => {}));
    const view = render(<TripTrackingScreen />); await act(async () => {});
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(getTrip).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(5000); });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(getTrip).toHaveBeenCalledTimes(2);
    const signal = getTrip.mock.calls[1][1];
    view.unmount(); await act(async () => {});
    expect(signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a late terminal event from a different trip and rereads durable state for this trip', async () => {
    render(<TripTrackingScreen />); await act(async () => {});
    const failed = (socketService.onTripFailed as jest.Mock).mock.calls[0][0];
    getTrip.mockResolvedValue({ ...trip, status: 'ACCEPTED', dispatchStatus: null,
      driver: { id: 'driver', user: { name: 'Test', phone: 'test' }, vehicleType: 'MOTO', licensePlate: 'test' } });
    await act(async () => { failed({ tripId: 'other', reason: 'old event' }); });
    expect(getTrip).toHaveBeenCalledTimes(1);
    await act(async () => { failed({ tripId: 'trip-1', reason: 'old event' }); });
    expect(screen.getByText('Driver is on the way')).toBeTruthy();
    expect(screen.queryByText("We couldn't contact drivers")).toBeNull();
  });

  it('does not let a pre-retry read overwrite the new search', async () => {
    useBookingStore.setState({ currentTrip: { ...trip, dispatchStatus: 'NO_DRIVER_FOUND' } });
    let finish!: (value: unknown) => void;
    getTrip.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<TripTrackingScreen />); await act(async () => {});
    fireEvent.press(screen.getByText('Search Again'));
    await act(async () => { finish({ ...trip, dispatchStatus: 'NO_DRIVER_FOUND' }); });
    expect(screen.getByText('Finding a nearby driver')).toBeTruthy();
  });
});
