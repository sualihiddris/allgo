export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteResponse {
  distance: number;
  duration: number;
  polyline?: string;
  bounds?: {
    northeast: GeoPoint;
    southwest: GeoPoint;
  };
}

export interface GeocodeResponse {
  location: GeoPoint;
  address: string;
  placeId?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

export interface PlaceDetails {
  placeId: string;
  address: string;
  location: GeoPoint;
}

export interface MapsProvider {
  getRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteResponse>;
  reverseGeocode(location: GeoPoint): Promise<GeocodeResponse>;
  geocode(address: string): Promise<GeocodeResponse>;
  autocompletePlaces(input: string, bias?: GeoPoint): Promise<PlaceSuggestion[]>;
  getPlaceDetails(placeId: string): Promise<PlaceDetails>;
}
