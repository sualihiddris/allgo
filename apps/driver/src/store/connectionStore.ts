import { create } from "zustand";

// Session-only evidence, deliberately separate from the driver's online intent.
export const useConnectionStore = create<{
  connected: boolean;
  authentication: "checking" | "authenticated" | "required";
  presence: "checking" | "ready" | "unavailable" | "ineligible";
}>(() => ({ connected: false, authentication: "checking", presence: "checking" }));
