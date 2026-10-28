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
- **Maps** — Mapbox Streets (vector tiles, OpenStreetMap data) drawn by the Mapbox Maps SDK through
  [`@rnmapbox/maps`](https://github.com/rnmapbox/maps). The whole app talks to the SDK through one file,
  `src/map/native.tsx`; everything else is written against its small interface.
  - **Token** — put `MAPBOX_ACCESS_TOKEN=pk.…` in `apps/mobile/.env` (or in the environment of the process that starts
    Metro). `babel.config.js` puts it into the bundle when the app is built, so after changing it restart Metro with
    `pnpm start --reset-cache`. It must be a **public** token (`pk.`); never a secret one (`sk.`), because it ships
    inside the app. Use a token **of its own for the app**, not the website's (that one is limited to the website's
    addresses, which a phone does not send). Keep `.env` out of git. Without a token the app still runs: the street
    map falls back to plain OpenStreetMap tiles.
  - **Native setup (once)** — `@rnmapbox/maps` 10.3 needs React Native's new architecture (already on:
    `newArchEnabled=true`) and no secret download token. Android: in `android/build.gradle` add
    `maven { url 'https://api.mapbox.com/downloads/v2/releases/maven' }` to `allprojects { repositories { … } }`.
    iOS: in `ios/Podfile` call `$RNMapboxMaps.pre_install(installer)` in a `pre_install` hook and
    `$RNMapboxMaps.post_install(installer)` inside `post_install`, then `bundle exec pod install`. Then
    `pnpm install` and rebuild the app (a JS reload is not enough: native code changed).
- **Map style** — `MAP_STYLE_URL` in `src/config.ts` (Mapbox Streets v12). Mapbox writes place names in English first
  and does not offer Persian, so `src/map/streetStyle.ts` downloads the style once per run of the app and puts the
  local name (`name`, Dari / Pashto script where OpenStreetMap has it) before the English one on every label — the
  same rule as the website. If that download fails the map uses Mapbox's own style (English labels); if Mapbox cannot be
  used at all (no token, token refused, service down) it draws plain OpenStreetMap raster tiles
  (`MAP_FALLBACK_TILE_URL`, meant for light use) until it is drawn again.
  Mapbox's terms require its logo and credit button on every map, so the map shows them (bottom left); the full
  credits, with the satellite imagery's, are also in the Account tab.
- **Billing** — Mapbox bills the mobile Maps SDKs by monthly active users (a person counts once in a billing period they
  view a map; tile requests made through the SDK are covered by that). Check the current free tier and price at
  mapbox.com/pricing before launch and set a spending alert in the Mapbox account.
- **Area name on the map** — the pill under the top controls names the place the map's middle is over
  («neighbourhood، district، province»). Zoomed out it is the nearest province (no network); zoomed in it asks the
  same place lookup as the listing form, after the map has rested, at most once every 2 s, remembered per ~1 km.
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
  map/                       Mapbox: native.tsx (the only file that touches the SDK), style.ts + streetStyle.ts (styles, local-name labels), geo.ts (camera, [lng,lat] helpers), BaseMap, PinMarker
  navigation/
    RootNavigator.tsx        stack: Tabs, PropertyDetails, AddProperty, SetLocation, Checkout, Referral, Chat, Templates, Auth (modal)
    MainTabs.tsx             Home · Dashboard (agency accounts only) · Messages (unread badge) · My listings · Account
    AuthNavigator.tsx        Phone → Otp → ProfileSetup
    useRequireAuth.ts        "sign in first" gate for contact / add / pay
    types.ts                 route params
  chat/                      ChatProvider (one Socket.io connection → React Query cache), messageCache, outbox (unsent messages), uuid, mapLinks, preview
  contact/                   useContactActions (Call / WhatsApp / Chat logic), contactLinks (tel:, wa.me)
  payments/usePaymentFlow    one HesabPay payment: create → open the payment page → poll until the webhook confirms
  components/                Button, TextField, Chip, PropertyCard, FilterSheet, ProvincePicker,
                             PropertyMap, LocationPicker, PropertyLocationMap, PinSection, OptionCard,
                             PromotionSheet (ladder / featured bottom sheet), PaymentProgress,
                             ContactActionBar, ContactLockSheet, MessageBubble, …
  screens/
    auth/                    PhoneScreen, OtpScreen, ProfileSetupScreen
    home/HomeScreen          province quick-picks + filters, list ⇄ map, infinite scroll
    property/                PropertyDetailsScreen, AddPropertyScreen, SetLocationScreen (add/move a pin)
    chat/                    ChatListScreen, ChatScreen (text, photo, pin, quick replies), TemplatesScreen (saved replies)
    agency/AgencyDashboardScreen  agency CRM home: listing counts, views, subscription days left, top listings (promote from here)
    payments/CheckoutScreen  subscription / map pin (and the older ladder / featured tab) → HesabPay → status polling
    my/MyListingsScreen      own listings: promote (sheet), archive, add or move the map pin
    account/AccountScreen    language switch, profile, "invite friends", sign out
    referral/ReferralScreen  my invite code + share sheet, friends who joined, free ladders earned
__tests__/                   unit + render tests      test-utils/  helpers, MockSocket (stands in for socket.io-client), navMock
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

- **Invite friends**: the Account tab (signed in) has a gold banner, "دعوت از دوستان و دریافت نردبان
  رایگان", with the person's own invitation link and two buttons: copy (system clipboard) and send
  (native share sheet). Tapping its top opens `ReferralScreen`: the code, the same link with the same
  two buttons, how many friends joined, and the free ladders earned. Data comes from
  `GET /referrals/me` (never cached). The link is the server's `share_url` when `REFERRAL_LINK_TEMPLATE`
  is set, otherwise `https://bongah.app/invite/{code}` built from the code (`share/referralLink.ts`, one
  place for the banner and the screen). The message always carries the code too. **Nothing opens
  `/invite/...` links yet** (no landing page, no sign-up deep link), so set the server template to
  match once there is one.
- **Sign-up** has an optional invite-code field on `PhoneScreen`. The code is checked for shape
  with the shared `normalizeReferralCode` and travels to `OtpScreen`, which sends it with the SMS
  code. If the server says the code does not exist (`INVALID_REFERRAL_CODE`, SMS code not used up),
  the person can carry on without it. A new account made with a valid code sees a welcome banner on
  `ProfileSetup`; both people get one free ladder.
- **Using a free ladder**: `PromotionSheet` shows "use free ladder" (Ladder selected, at least one
  token) and calls `POST /rewards/ladder-tokens/redeem`. Paying still works the same way.

## Saved listings, My listings and share links

- **Saved** (`screens/saved`, reached from the Account tab): the bookmarked listings as the same
  `PropertyCard` as Home, newest save first; one tap on a card's ribbon removes it. The ids live on the
  phone (`favorites/store.ts`). With none, it shows an illustration and "هیچ آگهی نشان نشده است". A saved
  listing that has since been sold carries the "معامله شد" badge.
- **My listings** (`screens/my`): a summary on top (live and closed deals: how many, and what their
  _sale_ listings add up to, per currency; rents and pledges are not added and AFN and USD are never
  mixed), the status chips, and per listing: live → promote, **معامله شد** (traded), **غیرفعال کردن**
  (off), edit, delete; traded or off → **فعال کردن** (on), edit, delete. Status changes are
  `PATCH /properties/:id {status}` (SOLD / ARCHIVED / ACTIVE); each asks first except switching on.
  **Delete** is `DELETE /properties/:id`, which only archives, so the server still returns the listing
  as "inactive". `listings/deleted.ts` keeps the deleted ids on the phone to hide them; on another phone
  they show up as inactive until the API has a real deleted state.
- **Share links**: a listing is shared as `https://bongah.app/listing/{id}` (`share/listingLink.ts`);
  `bongah://listing/{id}` (`listingDeepLink`) and earlier shares are understood too. React Navigation's
  `linking` (`navigation/linking.ts`, passed to `NavigationContainer` in `App.tsx`) opens the listing,
  with the map screen under it, both when a link starts the app and when one arrives while it is open.
  A launch from a link skips the opening animation.
- **To finish the web address (outside the app)**: serve `https://bongah.app/.well-known/assetlinks.json`
  (Android: package name + signing-key SHA-256; the manifest already has the `autoVerify` filter) and
  `https://bongah.app/.well-known/apple-app-site-association` (iOS), and add the
  `applinks:bongah.app` Associated Domains entitlement in Xcode. Until then the web address opens in
  the browser and only `bongah://...` opens the app. `AppDelegate.swift`, `Info.plist` (URL scheme) and
  `AndroidManifest.xml` (intent filters) are already set up. A native rebuild is needed.
- **Copy to clipboard** uses `@react-native-clipboard/clipboard`: run `pnpm install`, then
  `bundle exec pod install` in `ios/`, and rebuild.

## Contact and chat

- **Action bar** (pinned under every listing that is not yours): Call, WhatsApp, Chat in App.
  Call and WhatsApp need the owner's number, which the API meters (3 free reveals a day per
  account; agencies with an active subscription are unlimited). `useContactActions` always asks
  the server and never counts locally: already revealed today → use it; otherwise
  `POST /properties/:id/contact/unlock`; a `403 CONTACT_LIMIT_REACHED` opens `ContactLockSheet`.
  Call opens `tel:`; WhatsApp opens `https://wa.me/<digits>?text=…` with the listing title and a
  short `#reference` already typed (the person still presses send).
- **Lock sheet**: spend a credit the person already holds ("use 1 credit" is the only thing that
  ever sends `use_credit: true`), buy a pack through HesabPay (price and pack size come from
  `GET /hesabpay/pricing`), or go to the invite screen when invites earn credits. After a
  purchase the cached allowance is refreshed. Whatever was tapped (call or WhatsApp) is done once
  the credit is spent.
- **Chat**: `ChatProvider` keeps one socket open while signed in and writes what it receives
  (new messages, read receipts, typing) into the React Query cache; screens only read the cache.
  Sending uses the socket and falls back to HTTP; the message's `client_id` makes a retry safe.
  A message that failed stays in the list with its reason, a retry button and a delete button.
  Photos are shrunk on the phone before upload (a larger, sharper size for subscribed agencies);
  location pins and saved replies are for subscribed agencies only (the API enforces it too).
  Saved replies appear as chips above the box; tapping one puts the text in the box to edit.
- **Native dependency**: `react-native-image-picker` is new. After pulling run `pnpm install`,
  `cd ios && pod install`, and rebuild the app. Android may need the photo permission prompt
  handled per OS version; not tried on a device.

## Location: pin, plot, place search and directions

The pin (`lat`/`lng`) is free for everyone (round 4). On the listing form (`AddPropertyScreen`):

- **The map opens on the phone.** A new listing asks for location once as the form opens and flies to the phone's
  position (blue dot). It never places the pin: that is the person's tap. Refused or no GPS: the form works as before;
  the map's "my location" button explains and links to the settings.
- **Fullscreen** (`LocationEditor`, the button at the map's corner): the same map and state in a full-screen modal,
  for an exact pin and for drawing.
- **Plot outline** (mode «علامت گزاری مرز زمین»): tap the corners, drag a corner to move it, undo, close on the first corner. The
  area (m² and jerib) is live, from `ringAreaSqm` in `@bongah/validation`, the same function the server checks with.
  Crossing edges and specks are refused. A closed plot puts the pin on itself (kept if already inside, otherwise the
  middle) and is saved as `boundary` (GeoJSON Polygon). «همین را مساحت بگذار» copies its area into the area box.
- **One place field** «آدرس یا اسم مکان» replaces the province box and the address box. Typing suggests places
  (`PlaceSearchField`, 350 ms after the last key, older requests cancelled). Picking one flies the map there and sets
  the province. The province is still stored on its own: it follows the pin or the chosen place, and «تغییر» corrects it.
- **Address from the pin or plot** fills the field while the person has not written their own (as before).

Where answers come from (`src/map/GeocodingService.ts`, `src/map/routing.ts`):

| What                             | First                                                           | Fallback (asked by the phone)                                          |
| -------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Suggestions while typing         | API `GET /geo/autocomplete` (Google Places / Mapbox Search Box) | Photon (OSM, built for search-as-you-type)                             |
| Chosen suggestion                | API `GET /geo/places/:provider/:id`                             | Photon rows carry their coordinate                                     |
| "What is here"                   | API `GET /geo/reverse`                                          | Nominatim reverse                                                      |
| Written address nobody suggested |                                                                 | Nominatim search, after typing stops (its policy forbids autocomplete) |
| Driving route                    | API `GET /geo/route` (Google Routes / Mapbox Directions)        | OSRM demo server, then a dashed straight line                          |

The API holds the keys (`GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`, see `apps/api/.env.example`). The app has no
key and no Google SDK (`__tests__/noGoogleMaps.test.ts` still holds). `/geo/*` is for signed-in people only and
throttled; guests use the OpenStreetMap services. Photon, Nominatim and OSRM are shared fair-use servers: host your
own or pay for one before a public launch (`PHOTON_URL`, `GEOCODER_*`, `OSRM_ROUTE_URL` in `src/config.ts`).

**Directions** (`PropertyDetailsScreen`, «مسیریابی به ملک», listings with an exact pin only): `NavigationModal` follows
the phone (`useLiveLocation`, the Mapbox SDK's location module), draws the route and shows a HUD with the distance left
(«۴٫۲ کیلومتر»), arrival time («۸ دقیقه») and live speed («۴۵ km/h», the GPS's own speed, or distance over time).
Leaving the route by more than the GPS error asks for a new one, at most every 20 s. Within 30 m it says «به ملک
رسیدید». Location is only read while it is open. The screen may dim during a long drive (no keep-awake module).

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
- Push notifications for chat (a message only arrives live while the app is open and connected; otherwise it appears when the app next opens), block / report in chat, sending voice or video.
- Referral credits for map pins.
- Solar Hijri dates — dates show in the Gregorian calendar with Persian digits.
- Districts are free text (the API stores free-text districts).
