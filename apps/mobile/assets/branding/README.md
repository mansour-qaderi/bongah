# Bongah brand assets (Logo 1: roof with chimney + map pin)

The mark is drawn once, on a 100 × 100 grid, in `src/components/Logo.tsx` (`LOGO_GEOMETRY`). The SVG files here repeat
that same path data; `__tests__/logo.test.tsx` fails if they drift apart. Edit the geometry in `Logo.tsx` first, then
copy the numbers into the files below.

| File | Canvas | Use |
| --- | --- | --- |
| `logo.svg` | 100 × 100, transparent | The full mark with its ground ring (docs, web, store graphics). |
| `app-icon.svg` | 1024 × 1024, opaque white | iOS app icon master, Play Store icon, Android legacy icons. No ring. |
| `app-icon-android-foreground.svg` | 108 × 108 (dp), transparent | Android adaptive icon, foreground layer. The mark sits inside the 66 dp safe circle. |
| `app-icon-android-background.svg` | 108 × 108 (dp) | Android adaptive icon, background layer (plain white). Easier to use as the colour `#FFFFFF`. |
| `app-icon-android-monochrome.svg` | 108 × 108 (dp), transparent | Android 13+ themed icon: one colour, the system tints it; the pin's hole is see-through. |

Colours: emerald `#047857` (the theme's `colors.primary`) on the right half and the chimney, deep emerald `#065F46`
(`colors.primaryDark`) on the left half of the roof and the pin, ring `#E5E7EB`, background `#FFFFFF`. The ring is left
out of the launcher icons: a pale ring turns to mush at 48 px and fights the system's icon mask.

## Status: already generated and installed

The PNGs below were produced from these SVGs and are in the project:

- `assets/icon.png`: 1024 × 1024, opaque RGB (no alpha), the master for stores and anything else that wants one file.
- Android (`android/app/src/main/res`): `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png`, `ic_launcher_round.png`,
  `ic_launcher_foreground.png`, `ic_launcher_monochrome.png`; `mipmap-anydpi-v26/ic_launcher.xml` and
  `ic_launcher_round.xml` (adaptive icon, with the monochrome layer for Android 13 themed icons);
  `values/ic_launcher_background.xml` (`#FFFFFF`). `minSdk` is 24, so Android 7.x gets the plain PNGs and Android 8+ the
  adaptive icon.
- iOS (`ios/BongahMobile/Images.xcassets/AppIcon.appiconset`): every iPhone and iPad size plus the 1024 marketing icon,
  all opaque RGB, with `Contents.json` pointing at them (the project targets iPhone and iPad).

They were made with headless Chromium plus ImageMagick instead of `react-native-make` or `expo-cli`: the first is
unmaintained, the second is for Expo projects, and both would only have produced the same files. To regenerate after a
logo change, edit `LOGO_GEOMETRY` in `src/components/Logo.tsx`, copy the numbers into the SVGs here, and redo the steps
below. These files were checked as pictures and by pixel measurement (sizes, no alpha on iOS, mark inside the Android
safe circle) but **not on a phone or emulator**: build and look at the launcher and the app switcher.

## Make the PNGs

iOS and Android need PNGs. Any SVG renderer works; with `rsvg-convert` (`brew install librsvg`) and ImageMagick:

```bash
cd apps/mobile/assets/branding
mkdir -p out && cd out

# iOS / App Store: opaque (App Store Connect rejects an alpha channel), no rounded corners.
# Sizes: 20 29 40 58 60 76 80 87 120 152 167 180 1024 (iPhone and iPad), plus assets/icon.png at 1024.
for px in 20 29 40 58 60 76 80 87 120 152 167 180 1024; do
  rsvg-convert -w $px -h $px ../app-icon.svg -o AppIcon-$px.png
  magick AppIcon-$px.png -background white -alpha remove -alpha off AppIcon-$px.png
done

# Play Store listing icon: 512 x 512.
rsvg-convert -w 512 -h 512 ../app-icon.svg -o play-store-512.png

# Android adaptive layers (108 dp at each density) and legacy icons.
for d in mdpi:108:48 hdpi:162:72 xhdpi:216:96 xxhdpi:324:144 xxxhdpi:432:192; do
  IFS=: read -r name layer legacy <<< "$d"
  mkdir -p "mipmap-$name"
  rsvg-convert -w "$layer" -h "$layer" ../app-icon-android-foreground.svg -o "mipmap-$name/ic_launcher_foreground.png"
  rsvg-convert -w "$layer" -h "$layer" ../app-icon-android-monochrome.svg -o "mipmap-$name/ic_launcher_monochrome.png"
  rsvg-convert -w "$legacy" -h "$legacy" ../app-icon.svg -o "mipmap-$name/ic_launcher.png"
  # Round legacy icon: the same picture cropped to a circle.
  magick "mipmap-$name/ic_launcher.png" \
    \( -size "${legacy}x${legacy}" xc:none -fill white -draw "circle $((legacy/2)),$((legacy/2)) $((legacy/2)),0" \) \
    -compose DstIn -composite "mipmap-$name/ic_launcher_round.png"
done
```

Inkscape works too (`inkscape app-icon.svg -w 1024 -h 1024 -o AppIcon-1024.png`), and so does exporting from Figma.

## Android (`apps/mobile/android/app/src/main/res`)

1. Copy each `out/mipmap-<density>/` folder into `res/`, replacing the template's `ic_launcher.png` and
   `ic_launcher_round.png` and adding the foreground and monochrome files.
2. Add the background colour, `res/values/ic_launcher_background.xml`:

   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <resources>
     <color name="ic_launcher_background">#FFFFFF</color>
   </resources>
   ```

3. Add the adaptive icon (Android 8+) as `res/mipmap-anydpi-v26/ic_launcher.xml` and a copy named
   `ic_launcher_round.xml`:

   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
     <background android:drawable="@color/ic_launcher_background" />
     <foreground android:drawable="@mipmap/ic_launcher_foreground" />
     <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
   </adaptive-icon>
   ```

   (`monochrome` is only read on Android 13+; older versions ignore it.)
4. `AndroidManifest.xml` already points at `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round` in the React Native
   template; check `android:icon` and `android:roundIcon` on `<application>`.
5. Uninstall the old app (launchers cache icons), then `pnpm --filter @bongah/mobile android`.

Prefer a wizard? In Android Studio: right-click `res` → New → Image Asset → Launcher Icons (Adaptive and Legacy).
Foreground layer: Asset type *Image*, path `app-icon-android-foreground.svg`, Resize 100%. Background layer: Color
`FFFFFF`. The wizard writes all of the above for you; switch on "Show safe zone" to see the mark stays inside it.

## iOS (`apps/mobile/ios/BongahMobile/Images.xcassets/AppIcon.appiconset`)

Xcode 14 and newer accept one 1024 × 1024 image and make every size from it.

1. Copy `out/AppIcon-1024.png` into `AppIcon.appiconset/`.
2. Replace `Contents.json` in that folder with:

   ```json
   {
     "images": [
       {
         "filename": "AppIcon-1024.png",
         "idiom": "universal",
         "platform": "ios",
         "size": "1024x1024"
       }
     ],
     "info": { "author": "xcode", "version": 1 }
   }
   ```

   Or just drag the PNG onto the AppIcon slot in Xcode (open `ios/<AppName>.xcworkspace`, then Images.xcassets ▸
   AppIcon), which writes the same file. If you must support an older Xcode, keep the template's multi-size
   `Contents.json` and export each listed size (for iPhone: 40, 58, 60, 80, 87, 120, 180 and the 1024 marketing icon)
   with the `rsvg-convert` line above, flattened the same way.
3. Do not round the corners or add a shadow; iOS masks the icon itself. Keep the PNG opaque.
4. Delete the app from the simulator or phone, then `pnpm --filter @bongah/mobile ios`.

## The in-app splash vs. the system launch screen

`SplashScreen.tsx` is the animated screen shown *after* the app starts. Before it, the phone shows its own launch
screen: `ios/<AppName>/LaunchScreen.storyboard` on iOS, and on Android 12+ the system splash (the launcher icon on the
window background). Neither is changed by this work. Both are white, so the hand-over to the in-app splash is calm; if
you ever want a coloured system splash, change them there.
