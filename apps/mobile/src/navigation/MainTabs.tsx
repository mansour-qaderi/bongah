import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import AccountScreen from '../screens/account/AccountScreen';
import AgencyDashboardScreen from '../screens/agency/AgencyDashboardScreen';
import HomeScreen from '../screens/home/HomeScreen';
import MyListingsScreen from '../screens/my/MyListingsScreen';
import { colors } from '../theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

// Plain emoji keep the app free of an icon-font dependency (and its native linking).
const icon = (glyph: string) => () => <Text style={styles.icon}>{glyph}</Text>;

const styles = StyleSheet.create({ icon: { fontSize: 20 } });

export default function MainTabs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerTitleAlign: 'center',
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: t('nav.home'),
          headerShown: false,
          tabBarIcon: icon('🏠'),
        }}
      />
      {user?.role === 'AGENCY' ? (
        <Tab.Screen
          name="Dashboard"
          component={AgencyDashboardScreen}
          options={{ title: t('nav.dashboard'), tabBarIcon: icon('📊') }}
        />
      ) : null}
      <Tab.Screen
        name="MyListings"
        component={MyListingsScreen}
        options={{ title: t('nav.myListings'), tabBarIcon: icon('📋') }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: t('nav.account'), tabBarIcon: icon('👤') }}
      />
    </Tab.Navigator>
  );
}
