import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AboutScreen from '../screens/about/AboutScreen';
import AgencyDashboardScreen from '../screens/agency/AgencyDashboardScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import TemplatesScreen from '../screens/chat/TemplatesScreen';
import AddPropertyScreen from '../screens/property/AddPropertyScreen';
import PropertyDetailsScreen from '../screens/property/PropertyDetailsScreen';
import CheckoutScreen from '../screens/payments/CheckoutScreen';
import UpgradeScreen from '../screens/payments/UpgradeScreen';
import ReferralScreen from '../screens/referral/ReferralScreen';
import SavedListingsScreen from '../screens/saved/SavedListingsScreen';
import SplashScreen from '../screens/splash/SplashScreen';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import { stackScreenOptions } from './screenOptions';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Everything is reachable signed out except the actions that need an account; those open the
 * Auth flow as a modal on top (see useRequireAuth). The back arrow and swipe direction flip
 * automatically because the app runs right-to-left.
 */
export default function RootNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={stackScreenOptions}
    >
      {/* The opening screen; it resets the stack to Tabs, fading from one to the other. */}
      <Stack.Screen
        name="Splash"
        component={SplashScreen}
        options={{
          headerShown: false,
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Tabs"
        component={MainTabs}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="PropertyDetails"
        component={PropertyDetailsScreen}
        options={{ title: t('nav.propertyDetails') }}
      />
      <Stack.Screen
        name="Dashboard"
        component={AgencyDashboardScreen}
        options={{ title: t('nav.dashboard') }}
      />
      <Stack.Screen
        name="AddProperty"
        component={AddPropertyScreen}
        // A sheet that slides up over the screen it was opened from (it draws its own title and sliding), so the
        // route itself is a see-through page with no header and no animation of its own.
        options={{
          title: t('nav.addProperty'),
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: t('nav.checkout') }}
      />
      <Stack.Screen
        name="Upgrade"
        component={UpgradeScreen}
        options={{ title: t('nav.upgrade') }}
      />
      <Stack.Screen
        name="Referral"
        component={ReferralScreen}
        options={{ title: t('nav.referral') }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          title:
            route.params.conversation.counterpart.name ?? t('chat.counterpart'),
        })}
      />
      <Stack.Screen
        name="Templates"
        component={TemplatesScreen}
        options={{ title: t('nav.templates') }}
      />
      <Stack.Screen
        name="Saved"
        component={SavedListingsScreen}
        options={{ title: t('nav.saved') }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: t('nav.about') }}
      />
      <Stack.Screen
        name="Auth"
        component={AuthNavigator}
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
