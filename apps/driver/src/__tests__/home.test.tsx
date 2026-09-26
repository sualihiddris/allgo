import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { act, create } = require("react-test-renderer");

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), startTracking: vi.fn(), refreshLocation: vi.fn(),
  setOnline: vi.fn(), getMe: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", ScrollView: "ScrollView", Switch: "Switch",
  TouchableOpacity: "Button", StyleSheet: { create: (styles: unknown) => styles },
  Alert: { alert: vi.fn() },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../services/auth", () => ({ driverAuthService: { init: async () => true, getMe: mocks.getMe } }));
vi.mock("../services/driver", () => ({ driverApiService: { setOnline: mocks.setOnline } }));
vi.mock("../services/socket", () => ({ default: {
  connect: mocks.connect, disconnect: vi.fn(),
  onTripOffer: () => vi.fn(), onTripConfirmed: () => vi.fn(),
  onTripAcceptFailed: () => vi.fn(), onTripCancelled: () => vi.fn(),
} }));
vi.mock("../services/location", () => ({ default: {
  startTracking: mocks.startTracking, stopTracking: vi.fn(),
  isCurrentlyTracking: () => false, refreshLocation: mocks.refreshLocation,
} }));
vi.mock("../services/trip", () => ({ default: { getActiveTrips: async () => [] } }));
vi.mock("../components/JobOfferModal", () => ({ default: () => null }));
import HomeScreen from "../app/(main)/home";
import { useDriverStore } from "../store/driverStore";
import { useConnectionStore } from "../store/connectionStore";

describe("Driver Home truthfulness", () => {
  let screen: any;
  const profile = { id: "driver", name: "Driver", phone: "test", role: "DRIVER", driver: {
    isOnline: true, isApproved: true, subscriptionStatus: "ACTIVE" as const,
    vehicleType: "MOTO", serviceMode: "BOTH" as const, nightMode: false,
    rating: 5, totalTrips: 0, totalDeliveries: 0,
  } };
  const text = () => JSON.stringify(screen.toJSON());
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12));
    mocks.connect.mockResolvedValue({});
    mocks.startTracking.mockResolvedValue(true);
    mocks.getMe.mockResolvedValue(profile);
    useDriverStore.setState({ user: profile, isOnline: true, nightMode: false, isUpdatingOnline: false });
    useConnectionStore.setState({ connected: false, authentication: "checking", presence: "checking" });
  });
  afterEach(() => { if (screen) act(() => screen.unmount()); vi.useRealTimers(); });

  it("does not claim readiness on initial failure, disconnect, or stale presence and preserves intent", async () => {
    mocks.connect.mockRejectedValue(new Error("backend unavailable"));
    await act(async () => { screen = create(<HomeScreen />); });
    expect(text()).toContain("RECONNECTING");
    expect(text()).not.toContain("Waiting for a ride request");
    expect(text()).not.toContain('"ONLINE"');
    expect(useDriverStore.getState().isOnline).toBe(true);
    await act(async () => { useConnectionStore.setState({ connected: true, authentication: "authenticated" as const, presence: "checking" }); });
    expect(text()).not.toContain("Waiting for a ride request");
    await act(async () => { useConnectionStore.setState({ presence: "ready" }); });
    expect(text()).toContain("Waiting for a ride request");
    for (const evidence of [
      { connected: false, presence: "unavailable" as const },
      { connected: true, authentication: "authenticated" as const, presence: "checking" as const },
      { connected: true, authentication: "authenticated" as const, presence: "unavailable" as const },
      { connected: true, authentication: "authenticated" as const, presence: "ineligible" as const },
    ]) {
      await act(async () => { useConnectionStore.setState(evidence); });
      expect(text()).not.toContain("Waiting for a ride request");
      expect(useDriverStore.getState().isOnline).toBe(true);
    }
    await act(async () => { useConnectionStore.setState({ presence: "ready" }); });
    expect(text()).toContain("Waiting for a ride request");
    expect(mocks.setOnline).not.toHaveBeenCalled();
  });

  it("hides ready claims while a status change is pending", async () => {
    useDriverStore.setState({ isUpdatingOnline: true });
    useConnectionStore.setState({ connected: true, authentication: "authenticated" as const, presence: "ready" });
    await act(async () => { screen = create(<HomeScreen />); });
    expect(text()).toContain("Updating...");
    expect(text()).not.toContain("Waiting for a ride request");
    expect(text()).not.toContain('"ONLINE"');
  });

  it("shows sign-in-required instead of claiming automatic recovery after rejected credentials", async () => {
    useConnectionStore.setState({ connected: false, authentication: "required", presence: "unavailable" });
    await act(async () => { screen = create(<HomeScreen />); });
    expect(text()).toContain("SIGN IN REQUIRED");
    expect(text()).not.toContain("Waiting for a ride request");
    expect(text()).not.toContain("retry automatically");
    expect(useDriverStore.getState().isOnline).toBe(true);
  });

  it("does not advertise night readiness when night rides are off", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 22));
    useConnectionStore.setState({ connected: true, authentication: "authenticated" as const, presence: "ready" });
    await act(async () => { screen = create(<HomeScreen />); });
    expect(text()).not.toContain("Waiting for a ride request");
    expect(text()).not.toContain("Active now");
  });

  it("restores saved online intent after initialization but waits for new presence evidence", async () => {
    useDriverStore.setState({ isOnline: false, user: null });
    await useDriverStore.getState().initialize();
    await act(async () => { screen = create(<HomeScreen />); });
    expect(useDriverStore.getState().isOnline).toBe(true);
    expect(text()).toContain("RECONNECTING");
    expect(text()).not.toContain("Waiting for a ride request");
  });

  it("retries failed location startup but does not restart tracking after a later intentional stop", async () => {
    mocks.startTracking.mockResolvedValueOnce(false).mockResolvedValue(true);
    useConnectionStore.setState({ connected: true, authentication: "authenticated" as const, presence: "checking" });
    await act(async () => { screen = create(<HomeScreen />); });
    expect(mocks.startTracking).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.startTracking).toHaveBeenCalledTimes(2);
    // isCurrentlyTracking remains false, as after cancellation/completion.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(mocks.startTracking).toHaveBeenCalledTimes(2);
  });
});
