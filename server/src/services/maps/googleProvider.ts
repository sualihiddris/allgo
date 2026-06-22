import { MapsProvider, GeoPoint, RouteResponse, GeocodeResponse } from "./types";
import { env } from "../../config";

export class GoogleMapsProvider implements MapsProvider {
  private baseUrl = "https://maps.googleapis.com/maps/api";

  async getRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteResponse> {
    const url = `${this.baseUrl}/directions/json`;
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode: "driving",
      key: env.GOOGLE_MAPS_API_KEY || "",
    });
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    if (data.status !== "OK" || !data.routes?.length) {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    const route = data.routes[0];
    const leg = route.legs[0];
    return {
      distance: leg.distance.value,
      duration: leg.duration.value,
      polyline: route.overview_polyline?.points,
      bounds: route.bounds,
    };
  }

  async reverseGeocode(location: GeoPoint): Promise<GeocodeResponse> {
    const url = `${this.baseUrl}/geocode/json`;
    const params = new URLSearchParams({
      latlng: `${location.lat},${location.lng}`,
      key: env.GOOGLE_MAPS_API_KEY || "",
    });
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    if (data.status !== "OK" || !data.results?.length) {
      throw new Error(`Google Maps Geocoding error: ${data.status}`);
    }
    const result = data.results[0];
    return { location, address: result.formatted_address, placeId: result.place_id };
  }

  async geocode(address: string): Promise<GeocodeResponse> {
    const url = `${this.baseUrl}/geocode/json`;
    const params = new URLSearchParams({ address, key: env.GOOGLE_MAPS_API_KEY || "" });
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    if (data.status !== "OK" || !data.results?.length) {
      throw new Error(`Google Maps Geocoding error: ${data.status}`);
    }
    const result = data.results[0];
    return { location: result.geometry.location, address: result.formatted_address, placeId: result.place_id };
  }
}
