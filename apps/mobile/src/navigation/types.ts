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

export type TabParamList = {
  Home: undefined;
  /** Agency accounts only. */
  Dashboard: undefined;
  /** My conversations (as buyer and as seller). */
  Messages: undefined;
  MyListings: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  PropertyDetails: { id: string };
  AddProperty: undefined;
  /** Put (or move) the exact map pin of one of my listings. */
  SetLocation: { propertyId: string };
  /** `propertyId` + `purpose` preselect a promotion (from a listing's "promote" button). */
  Checkout:
    | {
        tab?: 'subscription' | 'promotion' | 'map';
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
