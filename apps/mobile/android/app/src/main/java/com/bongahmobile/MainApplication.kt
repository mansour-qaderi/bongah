package com.bongahmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.modules.i18nmanager.I18nUtil

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Dari and Pashto are right-to-left. Switch RTL on before React Native loads, so the very
    // first launch is already right-to-left (the JS-side forceRTL only applies from the next start).
    I18nUtil.instance.allowRTL(this, true)
    I18nUtil.instance.forceRTL(this, true)
    loadReactNative(this)
  }
}
