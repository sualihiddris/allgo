import { MapsProvider, GeoPoint, RouteResponse, GeocodeResponse, PlaceSuggestion, PlaceDetails } from "./types";

export class MockMapsProvider implements MapsProvider {
  async getRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteResponse> {
    const distance = this.calculateDistance(origin, destination);
    const duration = Math.ceil(distance / 15);
    return {
      distance,
      duration,
      polyline: "",
      bounds: {
        northeast: { lat: Math.max(origin.lat, destination.lat), lng: Math.max(origin.lng, destination.lng) },
        southwest: { lat: Math.min(origin.lat, destination.lat), lng: Math.min(origin.lng, destination.lng) },
      },
    };
  }
  async reverseGeocode(location: GeoPoint): Promise<GeocodeResponse> {
    return { location, address: `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` };
  }
  async geocode(address: string): Promise<GeocodeResponse> {
    return { location: { lat: 5.6037, lng: -0.1870 }, address };
  }
  async autocompletePlaces(input: string): Promise<PlaceSuggestion[]> {
    const text = `${input.trim()}, Ghana`;
    return input.trim().length >= 2 ? [{ placeId: `mock-${encodeURIComponent(input.trim())}`, text }] : [];
  }
  async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const text = decodeURIComponent(placeId.replace(/^mock-/, "")) || "Tarkwa";
    return {
      placeId,
      address: `${text}, Ghana`,
      location: { lat: 5.298625, lng: -2.001296 },
    };
  }
  private calculateDistance(from: GeoPoint, to: GeoPoint): number {
    const R = 6371e3;
    const φ1 = (from.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
    const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.ceil(R * c * 1.3);
  }
}
