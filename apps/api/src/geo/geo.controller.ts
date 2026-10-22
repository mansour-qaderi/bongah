import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { GeoProvider, PlaceDetails, PlaceSuggestions, RouteResult } from '@bongah/shared-types';
import {
  geoProviderSchema,
  placeAutocompleteQuerySchema,
  placeDetailsQuerySchema,
  placeIdSchema,
  reverseGeocodeQuerySchema,
  routeQuerySchema,
  type PlaceAutocompleteQuery,
  type PlaceDetailsQuery,
  type ReverseGeocodeQuery,
  type RouteQuery,
} from '@bongah/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { answerLanguage, GeoService } from './geo.service.js';

/**
 * Place search, "what is here" and driving routes through the paid providers whose keys only the server holds.
 *
 * Signed-in only, and throttled per caller: every call is billed to Bongah, so these must not be an open proxy. The
 * app debounces typing (one request per pause, not per key), and falls back to OpenStreetMap for guests and whenever
 * these answer 503 GEO_UNAVAILABLE.
 */
@Controller('geo')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /** Suggestions while typing "آدرس یا اسم مکان": landmarks, hospitals, universities, shops, streets, areas. */
  @Get('autocomplete')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async autocomplete(
    @Query(new ZodValidationPipe(placeAutocompleteQuerySchema)) query: PlaceAutocompleteQuery,
  ): Promise<PlaceSuggestions> {
    const data = await this.geo.autocomplete({
      query: query.q,
      near: query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined,
      session: query.session,
      language: answerLanguage(query.lang),
    });
    return { data };
  }

  /** The chosen suggestion: where it is and its address. 404 when the provider no longer knows the id. */
  @Get('places/:provider/:id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async place(
    @Param('provider', new ZodValidationPipe(geoProviderSchema)) provider: GeoProvider,
    @Param('id', new ZodValidationPipe(placeIdSchema)) id: string,
    @Query(new ZodValidationPipe(placeDetailsQuerySchema)) query: PlaceDetailsQuery,
  ): Promise<PlaceDetails> {
    const found = await this.geo.place(provider, id, query.session, answerLanguage(query.lang));
    if (!found) throw new NotFoundException({ message: 'Place not found.', code: 'PLACE_NOT_FOUND' });
    return found;
  }

  /** What is at a spot on the map (a pin, the middle of a drawn plot). 404 when no provider can describe it. */
  @Get('reverse')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async reverse(@Query(new ZodValidationPipe(reverseGeocodeQuerySchema)) query: ReverseGeocodeQuery): Promise<PlaceDetails> {
    const found = await this.geo.reverse({ lat: query.lat, lng: query.lng }, answerLanguage(query.lang));
    if (!found) throw new NotFoundException({ message: 'Nothing known at this spot.', code: 'PLACE_NOT_FOUND' });
    return found;
  }

  /** A driving route to a listing. The app asks again only when the driver leaves the line (about once a minute at most). */
  @Get('route')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async route(@Query(new ZodValidationPipe(routeQuerySchema)) query: RouteQuery): Promise<RouteResult> {
    const found = await this.geo.route(
      { lat: query.from_lat, lng: query.from_lng },
      { lat: query.to_lat, lng: query.to_lng },
    );
    if (!found) throw new NotFoundException({ message: 'No driving route between these points.', code: 'NO_ROUTE' });
    return found;
  }
}
