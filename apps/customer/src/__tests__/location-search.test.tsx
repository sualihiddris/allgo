import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import LocationSearchScreen from '../app/(main)/location-search';
import { authService } from '../services/auth';

jest.mock('../services/auth', () => ({
  authService: { authenticatedFetch: jest.fn() },
}));
jest.mock('expo-location', () => ({}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ type: 'destination' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => require('../constants/config').COLORS,
  useIsDarkMode: () => false,
}));

const fetchMock = authService.authenticatedFetch as jest.Mock;
const unavailable = 'Place search is unavailable. Please try again.';
const changeQuery = (query: string) =>
  fireEvent.changeText(screen.getByPlaceholderText('Search where to go...'), query);
const finishSearch = async () => {
  await act(async () => { jest.advanceTimersByTime(350); });
};
const suggestionsResponse = (suggestions: { placeId: string; text: string }[]) => ({
  ok: true,
  json: async () => ({ data: { suggestions } }),
});

describe('Location search outcomes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
  });
  afterEach(() => { jest.useRealTimers(); });

  it.each(['network rejection', 'HTTP failure'])('shows an unavailable state for %s', async (failure) => {
    if (failure === 'network rejection') fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    else fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    await finishSearch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(unavailable)).toBeTruthy();
    expect(screen.queryByText('No places found')).toBeNull();
  });

  it('shows no places only after a successful empty response', async () => {
    fetchMock.mockResolvedValueOnce(suggestionsResponse([]));
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    expect(screen.queryByText('No places found')).toBeNull();
    await finishSearch();
    expect(screen.getByText('No places found')).toBeTruthy();
    expect(screen.queryByText(unavailable)).toBeNull();
  });

  it.each(['network rejection', 'HTTP failure'])('replaces a successful empty result with only an error after %s', async (failure) => {
    fetchMock.mockResolvedValueOnce(suggestionsResponse([]));
    if (failure === 'network rejection') fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    else fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    await finishSearch();
    expect(screen.getByText('No places found')).toBeTruthy();

    changeQuery('Dambai Market');
    expect(screen.queryByText('No places found')).toBeNull();
    expect(screen.queryByText(unavailable)).toBeNull();
    await finishSearch();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(unavailable)).toBeTruthy();
    expect(screen.queryByText('No places found')).toBeNull();
    expect(screen.queryByText('Google Maps')).toBeNull();
  });

  it('clears previous suggestions when the next search fails', async () => {
    fetchMock.mockResolvedValueOnce(suggestionsResponse([{ placeId: 'market', text: 'Dambai Market' }]))
      .mockRejectedValueOnce(new TypeError('Network request failed'));
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    await finishSearch();
    expect(screen.getByText('Dambai Market')).toBeTruthy();
    changeQuery('Dambai Ferry');
    expect(screen.queryByText('Dambai Market')).toBeNull();
    await finishSearch();
    expect(screen.getByText(unavailable)).toBeTruthy();
    expect(screen.queryByText('Dambai Market')).toBeNull();
    expect(screen.queryByText('Google Maps')).toBeNull();
    expect(screen.queryByText('No places found')).toBeNull();
  });

  it('clears a failure and displays results from a later search', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(suggestionsResponse([{ placeId: 'market', text: 'Dambai Market' }]));
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    await finishSearch();
    expect(screen.getByText(unavailable)).toBeTruthy();
    changeQuery('Dambai Market');
    expect(screen.queryByText(unavailable)).toBeNull();
    await finishSearch();
    expect(screen.getByText('Dambai Market')).toBeTruthy();
    expect(screen.queryByText('No places found')).toBeNull();
    expect(screen.queryByText(unavailable)).toBeNull();
  });

  it('clears the failure when the query becomes too short', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    await finishSearch();
    changeQuery('');
    await finishSearch();
    expect(screen.queryByText(unavailable)).toBeNull();
    expect(screen.queryByText('No places found')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an older request failure after a newer search succeeds', async () => {
    let rejectOld!: (error: Error) => void;
    fetchMock.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(suggestionsResponse([{ placeId: 'market', text: 'Dambai Market' }]));
    render(<LocationSearchScreen />);
    changeQuery('Dambai');
    await finishSearch();
    changeQuery('Dambai Market');
    await finishSearch();
    await act(async () => { rejectOld(new Error('offline')); });
    expect(screen.getByText('Dambai Market')).toBeTruthy();
    expect(screen.queryByText(unavailable)).toBeNull();
    expect(screen.queryByText('No places found')).toBeNull();
  });
});
