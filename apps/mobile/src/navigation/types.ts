import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ChatConversation } from '@bongah/shared-types';

export type AuthStackParamList = {
  Phone: undefined;
  Otp: {
    phone: string;
    resendAfter: number;
    devOtp?: string;
    /** Canonical invite code typed on the phone screen, if any. */
    referralCode?: string;
  };
  /** `referralApplied`: the account was created with an invite code, so both got a reward. */
  ProfileSetup: { referralApplied?: boolean } | undefined;
};

/** The four tabs, in the order they appear (the first is at the right in Dari and Pashto). */
export type TabParamList = {
  Home: undefined;
  MyListings: undefined;
  /** My conversations (as buyer and as seller). */
  Messages: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  /** The opening screen. It resets the stack to `Tabs` after a moment, so it is never reachable by going back. */
  Splash: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  PropertyDetails: { id: string };
  /** The agency's CRM home; reached from the Account tab (agency accounts only). */
  Dashboard: undefined;
  /** Without a `propertyId` it posts a new listing; with one it edits that listing. */
  AddProperty: { propertyId?: string } | undefined;
  /** Featured-frame packs («کادر ویژه برای آگهی», 1/3/5/10/20) and nothing else. Subscriptions are on `Upgrade`. */
  Checkout: undefined;
  /** The subscription plans for agencies, with their discounts, and the way to pay. Reached from Account and the limit banners. */
  Upgrade: undefined;
  /** What I have left: listings I can publish, featured frames, ladders; with the ways to top them up. */
  Balance: undefined;
  /** My invite code, who joined with it and the rewards I earned. */
  Referral: undefined;
  /** One conversation. The snapshot supplies the header and listing card; messages are live. */
  Chat: { conversation: ChatConversation };
  /** My saved replies and the automatic reply (agencies with a subscription). */
  Templates: undefined;
  /** The listings I bookmarked (kept on this phone). Reached from the Account tab and from Home. */
  Saved: undefined;
  /** What Bongah is for, its version and how to reach the team. */
  About: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
