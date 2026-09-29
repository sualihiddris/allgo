import React from "react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const { act, create } = require("react-test-renderer");
vi.mock("react-native", () => ({ ActivityIndicator: "Spinner", Modal: "Modal", ScrollView: "Scroll",
  Text: "Text", TouchableOpacity: "Button", View: "View", Dimensions: { get: () => ({ height: 800 }) },
  StyleSheet: { create: (s: unknown) => s },
}));
import JobOfferModal from "../components/JobOfferModal";
import { useJobStore } from "../store/jobStore";
let tree: any;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 25, 12)); useJobStore.getState().reset(); });
afterEach(() => { if (tree) act(() => tree.unmount()); vi.useRealTimers(); });
function offer(id: string, remaining: number) {
  useJobStore.getState().setCurrentOffer({ tripId: 'trip', offerId: id, vehicleType: 'MOTO', serviceType: 'PASSENGER',
    pickup: { lat: 8, lng: 0, address: 'Pickup' }, destination: { lat: 8, lng: 0, address: 'Destination' },
    distance: 1, customerName: 'Test', customerPhone: 'test', expiresAt: Date.now() + remaining });
}
it('uses the offer deadline and resets for a new offer while the modal stays visible', async () => {
  const decline = vi.fn();
  offer('first', 5000);
  await act(async () => { tree = create(<JobOfferModal visible onAccept={vi.fn()} onDecline={decline} />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  await act(async () => { offer('second', 10000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(decline).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(decline).toHaveBeenCalledTimes(1);
});
it('expires by wall clock after a suspended timer resumes', async () => {
  const decline = vi.fn(); offer('first', 30000);
  await act(async () => { tree = create(<JobOfferModal visible onAccept={vi.fn()} onDecline={decline} />); });
  vi.setSystemTime(Date.now() + 31000);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(decline).toHaveBeenCalledTimes(1);
});
it('does not auto-decline a new offer because the previous countdown reached zero', async () => {
  const decline = vi.fn(); offer('first', 1000);
  await act(async () => { tree = create(<JobOfferModal visible onAccept={vi.fn()} onDecline={decline} />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(decline).toHaveBeenCalledTimes(1);
  await act(async () => { offer('second', 30000); });
  expect(decline).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).toContain('30');
});
