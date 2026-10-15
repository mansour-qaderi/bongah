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
  /** `referralApplied`: the account was created with an invite code, so both got a free ladder. */
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
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  PropertyDetails: { id: string };
  /** The agency's CRM home; reached from the Account tab (agency accounts only). */
  Dashboard: undefined;
  /** Without a `propertyId` it posts a new listing; with one it edits that listing. */
  AddProperty: { propertyId?: string } | undefined;
  /** `propertyId` + `purpose` preselect a promotion (from a listing's "promote" button). */
  Checkout:
    | {
        tab?: 'subscription' | 'promotion';
        propertyId?: string;
        purpose?: 'LADDER' | 'FEATURED_AD';
      }
    | undefined;
  /** My invite code, who joined with it and the free ladders I earned. */
  Referral: undefined;
  /** One conversation. The snapshot supplies the header and listing card; messages are live. */
  Chat: { conversation: ChatConversation };
  /** My saved replies and the automatic reply (agencies with a subscription). */
  Templates: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
