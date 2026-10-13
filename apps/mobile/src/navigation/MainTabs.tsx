import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useConversations } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import AccountScreen from '../screens/account/AccountScreen';
import AgencyDashboardScreen from '../screens/agency/AgencyDashboardScreen';
import HomeScreen from '../screens/home/HomeScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import MyListingsScreen from '../screens/my/MyListingsScreen';
import { formatNumber } from '../i18n/format';
import WelcomeGate from '../welcome/WelcomeGate';
import { colors } from '../theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

// Plain emoji keep the app free of an icon-font dependency (and its native linking).
const icon = (glyph: string) => () => <Text style={styles.icon}>{glyph}</Text>;

const styles = StyleSheet.create({ icon: { fontSize: 20 } });

export default function MainTabs() {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  // The unread badge on the Messages tab. The chat socket keeps this list fresh.
  const conversations = useConversations(status === 'signedIn');
  const unread = (conversations.data ?? []).reduce(
    (sum, conversation) => sum + conversation.unread_count,
    0,
  );
  return (
    <>
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
          name="Messages"
          component={ChatListScreen}
          options={{
            title: t('nav.messages'),
            tabBarIcon: icon('💬'),
            tabBarBadge:
              unread > 0 ? formatNumber(Math.min(unread, 99), 0) : undefined,
          }}
        />
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
      {/* Inside the screen the root stack shows, so it knows when the sign-in sheet is on top. */}
      <WelcomeGate />
    </>
  );
}
