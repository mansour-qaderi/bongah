import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useConversations } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import AccountScreen from '../screens/account/AccountScreen';
import HomeScreen from '../screens/home/HomeScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import MyListingsScreen from '../screens/my/MyListingsScreen';
import Icon, { type IconName } from '../components/Icon';
import { formatNumber } from '../i18n/format';
import WelcomeGate from '../welcome/WelcomeGate';
import { colors } from '../theme';
import FloatingTabBar from './FloatingTabBar';
import { headerOptions } from './screenOptions';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const renderTabBar = (props: BottomTabBarProps) => (
  <FloatingTabBar {...props} />
);

// Line icons drawn from plain views keep the app free of an icon-font dependency (and its native linking).
const icon =
  (name: IconName) =>
  ({
    color,
    size,
    focused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) =>
    (
      // The current tab is drawn a little heavier than the others.
      <Icon name={name} color={color} size={size} weight={focused ? 2 : 1.7} />
    );

export default function MainTabs() {
  const { t } = useTranslation();
  const { status } = useAuth();
  // The unread badge on the Messages tab. The chat socket keeps this list fresh.
  const conversations = useConversations(status === 'signedIn');
  const unread = (conversations.data ?? []).reduce(
    (sum, conversation) => sum + conversation.unread_count,
    0,
  );
  return (
    <>
      <Tab.Navigator
        tabBar={renderTabBar}
        screenOptions={{
          ...headerOptions,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          // Moving between tabs fades the pages into each other instead of cutting.
          animation: 'fade',
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: t('nav.home'),
            headerShown: false,
            tabBarIcon: icon('pin'),
          }}
        />
        <Tab.Screen
          name="MyListings"
          component={MyListingsScreen}
          options={{ title: t('nav.myListings'), tabBarIcon: icon('listings') }}
        />
        <Tab.Screen
          name="Messages"
          component={ChatListScreen}
          options={{
            title: t('nav.messages'),
            tabBarIcon: icon('chat'),
            tabBarBadge:
              unread > 0 ? formatNumber(Math.min(unread, 99), 0) : undefined,
          }}
        />
        <Tab.Screen
          name="Account"
          component={AccountScreen}
          options={{ title: t('nav.account'), tabBarIcon: icon('user') }}
        />
      </Tab.Navigator>
      {/* Inside the screen the root stack shows, so it knows when the sign-in sheet is on top. */}
      <WelcomeGate />
    </>
  );
}
