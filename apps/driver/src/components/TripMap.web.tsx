/**
 * Web fallback for TripMap - react-native-maps has no web support. Resolved
 * by Metro via the .web.tsx extension instead of TripMap.native.tsx, so the
 * native-only module is never even imported when bundling for web.
 *
 * No visual replacement needed here: active-job.tsx already shows pickup/
 * destination as a text-based route card regardless of whether a map is
 * present, so this simply renders nothing on web - exactly the experience
 * that existed before this map was added.
 */
export default function TripMap() {
  return null;
}
