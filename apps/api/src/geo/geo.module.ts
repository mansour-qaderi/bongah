import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import type { GeoBackend } from './geo.backend.js';
import { readGeoSettings } from './geo.config.js';
import { GeoController } from './geo.controller.js';
import { GEO_BACKENDS, GeoService } from './geo.service.js';
import { GoogleGeoBackend } from './google.backend.js';
import { MapboxGeoBackend } from './mapbox.backend.js';

/** Place search, reverse geocoding and routes through Google / Mapbox, keys on the server (see geo.config.ts). */
@Module({
  imports: [AuthModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [GeoController],
  providers: [
    {
      provide: GEO_BACKENDS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): GeoBackend[] => {
        const settings = readGeoSettings(config);
        const backends = settings.providers.map((name) =>
          name === 'google'
            ? new GoogleGeoBackend(settings.googleKey!, settings.timeoutMs)
            : new MapboxGeoBackend(settings.mapboxToken!, settings.timeoutMs),
        );
        new Logger('GeoModule').log(
          backends.length > 0
            ? `Place search and routes via ${settings.providers.join(', ')}`
            : 'No GOOGLE_MAPS_API_KEY or MAPBOX_ACCESS_TOKEN: /geo answers 503 and the app uses OpenStreetMap',
        );
        return backends;
      },
    },
    GeoService,
  ],
})
export class GeoModule {}
