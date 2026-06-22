// Type-only shim so tsc (which doesn't apply Metro's .native/.web platform
// extension resolution) can resolve `import TripMap from "./TripMap"`.
// Metro resolves the actual runtime module per-platform independently of
// this file - this exists purely for typechecking the native variant's
// prop signature against call sites.
export { default, TripMapPoint } from "./TripMap.native";
