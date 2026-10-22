import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { GeoProvider, PlaceDetails, PlaceSuggestion, RouteResult } from '@bongah/shared-types';
import { GeoBackendError, type AutocompleteRequest, type GeoBackend, type LatLng } from './geo.backend.js';

/** Injection token for the configured providers, in the order they are asked. */
export const GEO_BACKENDS = Symbol('GEO_BACKENDS');

/** What the app is told when no paid provider could answer: it then asks OpenStreetMap itself. */
export const GEO_UNAVAILABLE = 'GEO_UNAVAILABLE';

/** The answer language for the app's language: Dari is written Persian ("fa"), Pashto is "ps". */
export const answerLanguage = (lang: 'prs' | 'ps' | undefined): string => (lang === 'ps' ? 'ps' : 'fa');

/**
 * Asks the configured place/route providers (Google, then Mapbox, or as GEO_PROVIDERS says) and returns the first
 * useful answer. A provider that is down or refuses is skipped (and logged without its key or the query); one that
 * answers "nothing" lets the next one try, because the providers know different parts of Afghanistan. When every
 * one failed, or none is configured, the answer is 503 GEO_UNAVAILABLE and the app falls back to OpenStreetMap.
 *
 * Nothing is cached: Google's and Mapbox's terms restrict keeping their results, and each answer is cheap next to
 * what it would cost to get that wrong.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(@Inject(GEO_BACKENDS) private readonly backends: GeoBackend[]) {}

  /** The providers this deployment asks, in order (an empty list means "the app uses OpenStreetMap"). */
  get providers(): GeoProvider[] {
    return this.backends.map((backend) => backend.name);
  }

  autocomplete(request: AutocompleteRequest): Promise<PlaceSuggestion[]> {
    return this.firstUseful('autocomplete', this.backends, (backend) => backend.autocomplete(request), (list) => list.length > 0, []);
  }

  /** A chosen suggestion's details. Only the provider that made the id can read it. */
  async place(provider: GeoProvider, id: string, session: string | undefined, language: string): Promise<PlaceDetails | null> {
    const backend = this.backends.filter((candidate) => candidate.name === provider);
    return this.firstUseful('place', backend, (b) => b.place(id, session, language), (found) => found !== null, null);
  }

  reverse(point: LatLng, language: string): Promise<PlaceDetails | null> {
    return this.firstUseful('reverse', this.backends, (backend) => backend.reverse(point, language), (found) => found !== null, null);
  }

  route(from: LatLng, to: LatLng): Promise<RouteResult | null> {
    return this.firstUseful('route', this.backends, (backend) => backend.route(from, to), (found) => found !== null, null);
  }

  /**
   * Asks each backend in turn until one gives a useful answer. Returns `empty` when they all answered but none had
   * anything; throws 503 when none could answer at all.
   */
  private async firstUseful<T>(
    what: string,
    backends: GeoBackend[],
    ask: (backend: GeoBackend) => Promise<T>,
    useful: (answer: T) => boolean,
    empty: T,
  ): Promise<T> {
    let answered = false;
    for (const backend of backends) {
      try {
        const answer = await ask(backend);
        answered = true;
        if (useful(answer)) return answer;
      } catch (error) {
        if (!(error instanceof GeoBackendError)) throw error;
        this.logger.warn(`geo ${what} failed: ${error.message}`);
      }
    }
    if (answered) return empty;
    throw new ServiceUnavailableException({
      message: backends.length === 0 ? 'No place service is configured.' : 'The place service did not answer.',
      code: GEO_UNAVAILABLE,
    });
  }
}
