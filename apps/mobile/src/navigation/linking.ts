import {
  getStateFromPath,
  type LinkingOptions,
} from '@react-navigation/native';
import {
  LISTING_APP_SCHEME,
  LISTING_WEB_HOST,
  parseListingPath,
} from '../share/listingLink';
import type { RootStackParamList } from './types';

/**
 * How the app is opened from outside: a shared listing link opens that listing.
 *
 *   https://bongah.app/listing/{id}   (Android App Links / iOS Universal Links)
 *   bongah://listing/{id}             (the app's own scheme)
 *
 * React Navigation does the listening for both situations: when a link starts the app (`getInitialURL`) and when one
 * arrives while the app is already open (the `url` event). Adding a second listener beside it would navigate twice,
 * so this file only says which links are ours and where they go. The state it builds is `Tabs` with the listing on
 * top, so the back arrow lands on the map, as after opening the listing from it. A launch from a link skips the
 * opening animation (its stack has no splash), which is what a person tapping a link wants.
 *
 * Anything that is not a listing link (another path, an empty id) is ignored and the app opens normally.
 *
 * What still has to exist outside the app for the web address (not for `bongah://`): the domain serving
 * `/.well-known/assetlinks.json` (Android) and `/.well-known/apple-app-site-association` (iOS), and the
 * `applinks:bongah.app` entitlement in the iOS project. See the app's README.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    `${LISTING_APP_SCHEME}://`,
    `https://${LISTING_WEB_HOST}`,
    `https://www.${LISTING_WEB_HOST}`,
  ],
  config: {
    // The screen under a link's screen. Without it the stack would hold the listing alone.
    initialRouteName: 'Tabs',
    screens: {
      PropertyDetails: 'listing/:id',
    },
  },
  getStateFromPath(path, options) {
    // The library's own matching would also accept `listing/` with an empty id or other shapes; ours is stricter.
    if (parseListingPath(path) === null) return undefined;
    return getStateFromPath(path, options);
  },
};
