const fs = require('fs');
const path = require('path');

// A React Native app has no environment of its own, so values from .env are put into the bundle at build time:
// this reads apps/mobile/.env (when there is one) into the environment of the build, and the plugin below replaces
// each `process.env.NAME` listed in INLINED with its value. Only the names listed are ever put into the app.
// After changing .env restart Metro with `pnpm start --reset-cache`: Metro does not notice the change by itself.
const INLINED = ['MAPBOX_ACCESS_TOKEN'];
const isTest = process.env.NODE_ENV === 'test';

const envFile = path.join(__dirname, '.env');
if (!isTest && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    // A value already in the environment wins over the file, as with every dotenv tool.
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Tests read the real environment at run time instead, so they never depend on a developer's .env.
  plugins: isTest
    ? []
    : [['transform-inline-environment-variables', { include: INLINED }]],
};
