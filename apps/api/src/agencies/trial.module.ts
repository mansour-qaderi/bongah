import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AGENCY_TRIAL_SETTINGS, readAgencyTrialSettings } from './trial.config.js';

/** The agency trial settings, read once and available to every module (publishing, registration, the wallet). */
@Global()
@Module({
  providers: [
    {
      provide: AGENCY_TRIAL_SETTINGS,
      inject: [ConfigService],
      useFactory: readAgencyTrialSettings,
    },
  ],
  exports: [AGENCY_TRIAL_SETTINGS],
})
export class AgencyTrialModule {}
