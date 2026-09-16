import { MapsProvider, GeoPoint, RouteResponse, GeocodeResponse, PlaceSuggestion, PlaceDetails } from "./types";
import { env } from "../../config";

const GOOGLE_MAPS_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Robust AbortError detection for Node/TypeScript.
 *
 * Real fetch aborts surface as a DOMException named "AbortError" in
 * undici/Node 18+, but depending on the runtime (or a non-native fetch
 * implementation) the same condition can arrive as a plain Error whose
 * name is "AbortError". Check the name across both Error and DOMException
 * (and any foreign error-like object) rather than relying on instanceof
 * alone, and never match a non-Error primitive.
 */
function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  if (error instanceof Error) {
    return error.name === "AbortError";
  }
  return (error as { name?: unknown }).name === "AbortError";
}

export class GoogleMapsProvider implements MapsProvider {
  private baseUrl = "https://maps.googleapis.com/maps/api";
  private placesUrl = "https://places.googleapis.com/v1";

  private async fetchWithTimeout(
    input: string,
    init?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOOGLE_MAPS_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      // Translate to the timeout error ONLY when BOTH conditions hold:
      //   1. THIS helper's controller was aborted by its own timer, AND
      //   2. the caught error is actually an AbortError from the fetch.
      // An unrelated error that merely races with the abort must pass
      // through unchanged.
      if (controller.signal.aborted && isAbortError(error)) {
        throw new Error("Google Maps request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async getRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteResponse> {
    const url = `${this.baseUrl}/directions/json`;
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode: "driving",
      key: env.GOOGLE_MAPS_API_KEY || "",
    });
    const response = await this.fetchWithTimeout(`${url}?${params}`);
    const data: any = await response.json();
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
    const response = await this.fetchWithTimeout(`${url}?${params}`);
    const data: any = await response.json();
    if (data.status !== "OK" || !data.results?.length) {
      throw new Error(`Google Maps Geocoding error: ${data.status}`);
    }
    const result = data.results[0];
    return { location, address: result.formatted_address, placeId: result.place_id };
  }

  async geocode(address: string): Promise<GeocodeResponse> {
    const url = `${this.baseUrl}/geocode/json`;
    const params = new URLSearchParams({ address, key: env.GOOGLE_MAPS_API_KEY || "" });
    const response = await this.fetchWithTimeout(`${url}?${params}`);
    const data: any = await response.json();
    if (data.status !== "OK" || !data.results?.length) {
      throw new Error(`Google Maps Geocoding error: ${data.status}`);
    }
    const result = data.results[0];
    return { location: result.geometry.location, address: result.formatted_address, placeId: result.place_id };
  }

  async autocompletePlaces(input: string, bias?: GeoPoint): Promise<PlaceSuggestion[]> {
    const locationBias = bias
      ? { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 } }
      : undefined;
    const response = await this.fetchWithTimeout(`${this.placesUrl}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY || "",
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["gh"],
        languageCode: "en",
        regionCode: "gh",
        ...(locationBias ? { locationBias } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Google Places autocomplete error: ${response.status}`);
    }
    const data: any = await response.json();
    return (Array.isArray(data.suggestions) ? data.suggestions : [])
      .map((suggestion: any) => suggestion.placePrediction)
      .filter((prediction: any) => prediction?.placeId && prediction?.text?.text)
      .map((prediction: any) => ({ placeId: prediction.placeId, text: prediction.text.text }));
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const response = await this.fetchWithTimeout(`${this.placesUrl}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY || "",
        "X-Goog-FieldMask": "id,formattedAddress,location",
      },
    });
    if (!response.ok) {
      throw new Error(`Google Places details error: ${response.status}`);
    }
    const data: any = await response.json();
    if (
      data.id !== placeId ||
      typeof data.formattedAddress !== "string" ||
      !Number.isFinite(data.location?.latitude) ||
      !Number.isFinite(data.location?.longitude)
    ) {
      throw new Error("Google Places details returned an unusable place");
    }
    return {
      placeId: data.id,
      address: data.formattedAddress,
      location: { lat: data.location.latitude, lng: data.location.longitude },
    };
  }
}
