import { MapsProvider } from "./types";
import { MockMapsProvider } from "./mockProvider";
import { GoogleMapsProvider } from "./googleProvider";
import { env } from "../../config";

class MapsService {
  private provider: MapsProvider;

  constructor() {
    if (env.GOOGLE_MAPS_API_KEY) {
      this.provider = new GoogleMapsProvider();
      console.log("✅ Maps: Using Google Maps");
    } else {
      this.provider = new MockMapsProvider();
      console.log("⚠️  Maps: Using Mock Provider (set GOOGLE_MAPS_API_KEY for production)");
    }
  }

  getProvider(): MapsProvider {
    return this.provider;
  }

  async getRoute(...args: Parameters<MapsProvider["getRoute"]>) {
    return this.provider.getRoute(...args);
  }

  async reverseGeocode(...args: Parameters<MapsProvider["reverseGeocode"]>) {
    return this.provider.reverseGeocode(...args);
  }

  async geocode(...args: Parameters<MapsProvider["geocode"]>) {
    return this.provider.geocode(...args);
  }
}

export const mapsService = new MapsService();
export { MapsProvider, GeoPoint, RouteResponse, GeocodeResponse } from "./types";
