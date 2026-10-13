# Bongah mobile app

React Native 0.87 (bare CLI) app for Bongah (رهنمای معاملات و املاک). It is **right-to-left in
both supported languages**: Dari (`prs`) and Pashto (`ps`).

## Run it

From the repository root:

```sh
pnpm install
pnpm build:packages          # the app imports the compiled @bongah/shared-types and @bongah/validation
pnpm --filter @bongah/api db:migrate && pnpm --filter @bongah/api db:generate   # API database (once)
pnpm --filter @bongah/api start:dev   # API on http://localhost:3000
pnpm --filter @bongah/mobile start    # Metro
pnpm --filter @bongah/mobile android  # or: ios (macOS only; run `bundle exec pod install` in ios/ first)
```

- **API address** — `src/config.ts`. The Android emulator reaches your computer at `10.0.2.2`,
  the iOS simulator at `localhost`. On a physical phone set `DEV_API_HOST` to your computer's LAN
  address. Release builds use `PRODUCTION_API_URL` (must be HTTPS).
- **Maps** — OpenStreetMap tiles drawn by [MapLibre Native](https://maplibre.org/) (`@maplibre/maplibre-react-native`).
  There is **no Google Maps key, no Mapbox token and no account** to set up. MapLibre needs React
  Native's new architecture (on by default in 0.87) and a native rebuild: `pnpm install`, then
  `bundle exec pod install` in `ios/`, then run the app again.
- **Map tiles** — `MAP_TILE_URL` in `src/config.ts` (default: the public OpenStreetMap server). OSM's
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) allows light use only, so
  before a public launch point it at a paid or self-hosted raster tile service (MapTiler, Stadia,
  your own server). Keep `MAP_ATTRIBUTION` matching whichever provider you use; the app draws it on every map.
- With the mock SMS gateway the API returns `dev_otp`, and the OTP screen shows it (debug builds only).

## Checks

```sh
pnpm --filter @bongah/mobile typecheck
pnpm --filter @bongah/mobile lint
pnpm --filter @bongah/mobile test
```

## Folder structure

```
App.tsx                      providers: i18n gate → React Query → Auth → Navigation
index.js                     forces RTL, then registers the app
src/
  config.ts                  API URL, timeouts, payment polling
  theme/                     colours, spacing, Arabic-script line heights
  i18n/
    index.ts                 i18next setup, saved/device language, changeLanguage()
    rtl.ts                   I18nManager.allowRTL(true) + forceRTL(true)
    format.ts                Persian digits, prices, jerib ⇄ m², Kabul-time dates
    useFormat.ts             formatting bound to the current language
    languages.ts             language metadata
    locales/prs.json         Dari strings   (typed keys: a wrong t('…') key fails tsc)
    locales/ps.json          Pashto strings (a unit test keeps both files in sync)
  api/
    client.ts                fetch wrapper: timeouts, ApiError, bearer token, 401 → sign out
    endpoints.ts             one function per API endpoint
    errors.ts                ApiError → message in the user's language
    hooks.ts                 React Query client, query keys, list/detail hooks
  auth/
    sessionStorage.ts        JWT in the platform keychain
    AuthContext.tsx          sign in/out, session restore, role refresh (GET /users/me)
  storage/kv.ts              preferences (language) in AsyncStorage v3
  constants/provinces.ts     34 provinces: Dari/Pashto names, centres, quick-pick cities
  map/                       MapLibre/OSM: style.ts (tile style), geo.ts (camera, [lng,lat] helpers), BaseMap, PinMarker
  navigation/
    RootNavigator.tsx        stack: Tabs, PropertyDetails, AddProperty, SetLocation, Checkout, Auth (modal)
    MainTabs.tsx             Home · Dashboard (agency accounts only) · My listings · Account
    AuthNavigator.tsx        Phone → Otp → ProfileSetup
    useRequireAuth.ts        "sign in first" gate for contact / add / pay
    types.ts                 route params
  payments/usePaymentFlow    one HesabPay payment: create → open the payment page → poll until the webhook confirms
  components/                Button, TextField, Chip, PropertyCard, FilterSheet, ProvincePicker,
                             PropertyMap, LocationPicker, PropertyLocationMap, PinSection, OptionCard,
                             PromotionSheet (ladder / featured bottom sheet), PaymentProgress, …
  screens/
    auth/                    PhoneScreen, OtpScreen, ProfileSetupScreen
    home/HomeScreen          province quick-picks + filters, list ⇄ map, infinite scroll
    property/                PropertyDetailsScreen, AddPropertyScreen, SetLocationScreen (add/move a pin)
    agency/AgencyDashboardScreen  agency CRM home: listing counts, views, subscription days left, top listings (promote from here)
    payments/CheckoutScreen  subscription / map pin (and the older ladder / featured tab) → HesabPay → status polling
    my/MyListingsScreen      own listings: promote (sheet), archive, add or move the map pin
    account/AccountScreen    language switch, profile, "invite friends", sign out
    referral/ReferralScreen  my invite code + share sheet, friends who joined, free ladders earned
__tests__/                   unit + render tests      test-utils/  small test helpers
```

## Agency dashboard and promotions

- The **Dashboard** tab appears only for accounts whose role is `AGENCY`. It reads
  `GET /agencies/me/dashboard` (never cached: views and subscription days move on their own).
  The query key sits under `properties`, so adding, archiving or paying for a listing refreshes it.
- **Promoting** a listing (Dashboard, My listings, the owner's details page) opens
  `PromotionSheet`: Ladder or Featured, then the HesabPay payment. The app sends only the
  purpose and the listing id; the server sets the price. `CheckoutScreen` still has an older
  "promotion" tab that nothing links to any more and that can be deleted.
- **Views**: the details screen calls `POST /properties/:id/view` once per opening, not for the
  owner, and ignores failures. The count is a plain tally, not distinct people.

## Referrals and rewards

- **Invite friends** (Account tab, signed in) opens `ReferralScreen`: the user's code (select it to
  copy), a Share button (native share sheet), how many friends joined, and the free ladders earned.
  Data comes from `GET /referrals/me` (never cached). The share text includes a link only when the
  server has `REFERRAL_LINK_TEMPLATE` set; otherwise it carries the code alone.
- **Sign-up** has an optional invite-code field on `PhoneScreen`. The code is checked for shape
  with the shared `normalizeReferralCode` and travels to `OtpScreen`, which sends it with the SMS
  code. If the server says the code does not exist (`INVALID_REFERRAL_CODE`, SMS code not used up),
  the person can carry on without it. A new account made with a valid code sees a welcome banner on
  `ProfileSetup`; both people get one free ladder.
- **Using a free ladder**: `PromotionSheet` shows "use free ladder" (Ladder selected, at least one
  token) and calls `POST /rewards/ladder-tokens/redeem`. Paying still works the same way.

## Map pins and who pays for them

Every listing has province, district and neighborhood **text**. The exact map pin (`lat`/`lng`) is
a paid extra:

- **Agencies with a running subscription** (and admins) pin any number of listings for free.
- **Everyone else** buys a "map location" add-on through HesabPay (`Checkout`, tab _map_), which
  gives one prepaid pin. The first pin on a listing spends it; moving that pin later is free.
- The app asks the API (`GET /map-location/status`) and shows the map picker only to people who
  may use it; otherwise it shows the price and a buy button. The API enforces the same rule, so a
  stale screen gets `MAP_LOCATION_REQUIRED` and is sent to the purchase.
- Referral credits are not built: there is no referral system yet. The API has a token source
  for them, ready for when it exists.

## How right-to-left works

Both languages are RTL, so the layout direction never changes with the language; switching
language only swaps strings (no restart).

React Native applies `forceRTL` on the **next** process start, so the native entry points also
switch RTL on before React Native loads (`MainApplication.kt`, `AppDelegate.swift`); the JS call
in `index.js` is the safety net. In debug builds a console warning appears if the layout is not RTL.

Rules for new UI: use `flexDirection: 'row'` (it flips by itself), `marginStart/End`,
`paddingStart/End`, `start/end` — never `left`/`right` for layout. Wrap phone numbers, codes and
URLs in a `TextField` with `ltr`.

## What is not built yet

- Photo upload — the form accepts image **links** only (the API has no upload endpoint yet).
- Agency registration (name, licence, address), the agency office-pin screen (the API has
  `PUT /agencies/me/location`; no screen uses it yet) and the agency branding pages.
- Editing a listing's details: the API has `PATCH /properties/:id`, but the app only has the
  create form. The dashboard's "manage listings" opens My listings (promote, map pin, archive).
- Referral credits for map pins (no referral system exists).
- Solar Hijri dates — dates show in the Gregorian calendar with Persian digits.
- Districts are free text (the API stores free-text districts).
