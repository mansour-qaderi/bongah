# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# R8 is on for release builds (see build.gradle). React Native, Hermes, Firebase and Mapbox ship their own consumer
# rules; these are the extra safety nets. If a release build fails with "Missing class", the full list is written to
# app/build/outputs/mapping/release/missing_rules.txt.
-keep class com.rnmapbox.rnmbx.** { *; }
# The Mapbox SDK keeps what its native code reaches by name with rules of its own (consumer rules); not kept here,
# so R8 can still drop the parts of it the app never calls.
-dontwarn com.mapbox.**
-keep class io.invertase.firebase.** { *; }
-keep class com.oblador.keychain.** { *; }
-keep class com.imagepicker.** { *; }
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
# Stack traces from the Play console / adb stay readable with the mapping file R8 writes next to the build.
-keepattributes SourceFile,LineNumberTable
