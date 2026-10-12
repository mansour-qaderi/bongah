import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import OtpScreen from '../screens/auth/OtpScreen';
import PhoneScreen from '../screens/auth/PhoneScreen';
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Phone"
        component={PhoneScreen}
        options={{ title: t('auth.phoneTitle') }}
      />
      <Stack.Screen
        name="Otp"
        component={OtpScreen}
        options={{ title: t('auth.otpTitle') }}
      />
      <Stack.Screen
        name="ProfileSetup"
        component={ProfileSetupScreen}
        options={{ title: t('auth.profileTitle'), headerBackVisible: false }}
      />
    </Stack.Navigator>
  );
}
