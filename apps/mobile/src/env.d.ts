/**
 * The values babel.config.js puts into the bundle (see its INLINED list). React Native defines no `process`, so this
 * declares only what exists: each name is replaced by its value when the app is built.
 */
declare const process: {
  env: {
    MAPBOX_ACCESS_TOKEN?: string;
  };
};
