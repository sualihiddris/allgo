/**
 * AllGO Maps Routes
 *
 * Thin server-side proxy for Google Maps calls that must not run directly
 * in client code - keeps GOOGLE_MAPS_API_KEY off the browser entirely.
 * Currently just reverse geocoding, used by the customer app's web
 * platform: expo-location's reverseGeocodeAsync has no working web
 * implementation (Google deprecated the legacy endpoint it called), so
 * web falls back to this route while native iOS/Android keep using the
 * OS-level geocoder directly (unaffected, no server round-trip needed).
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { generalRateLimit } from "../middleware/rateLimit";
import { mapsService } from "../services/maps";
import { sendSuccess } from "../utils";

const router = Router();

const reverseGeocodeSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});
const autocompleteSchema = z.object({
  q: z.string().trim().min(2).max(100),
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
}).refine((value) => (value.lat === undefined) === (value.lng === undefined), {
  message: "lat and lng must be supplied together",
});

/**
 * GET /api/v1/maps/reverse-geocode?lat=&lng=
 */
router.get(
  "/reverse-geocode",
  requireAuth,
  generalRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lat, lng } = reverseGeocodeSchema.parse(req.query);
      const result = await mapsService.reverseGeocode({ lat, lng });
      sendSuccess(res, { address: result.address });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/places/autocomplete",
  requireAuth,
  generalRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, lat, lng } = autocompleteSchema.parse(req.query);
      const suggestions = await mapsService.autocompletePlaces(
        q,
        lat === undefined || lng === undefined ? undefined : { lat, lng }
      );
      sendSuccess(res, { suggestions });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/places/:placeId",
  requireAuth,
  generalRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const placeId = z.string().trim().min(1).max(512).parse(req.params.placeId);
      const place = await mapsService.getPlaceDetails(placeId);
      sendSuccess(res, {
        place: {
          placeId: place.placeId,
          address: place.address,
          lat: place.location.lat,
          lng: place.location.lng,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const mapsRouter = router;
