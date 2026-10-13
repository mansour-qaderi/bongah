import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AddPropertyScreen from '../screens/property/AddPropertyScreen';
import PropertyDetailsScreen from '../screens/property/PropertyDetailsScreen';
import SetLocationScreen from '../screens/property/SetLocationScreen';
import CheckoutScreen from '../screens/payments/CheckoutScreen';
import ReferralScreen from '../screens/referral/ReferralScreen';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
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
    <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen
        name="Tabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PropertyDetails"
        component={PropertyDetailsScreen}
        options={{ title: t('nav.propertyDetails') }}
      />
      <Stack.Screen
        name="AddProperty"
        component={AddPropertyScreen}
        options={{ title: t('nav.addProperty') }}
      />
      <Stack.Screen
        name="SetLocation"
        component={SetLocationScreen}
        options={{ title: t('nav.setLocation') }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: t('nav.checkout') }}
      />
      <Stack.Screen
        name="Referral"
        component={ReferralScreen}
        options={{ title: t('nav.referral') }}
      />
      <Stack.Screen
        name="Auth"
        component={AuthNavigator}
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
