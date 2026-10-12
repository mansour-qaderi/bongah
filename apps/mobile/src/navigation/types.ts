import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Phone: undefined;
  Otp: { phone: string; resendAfter: number; devOtp?: string };
  ProfileSetup: undefined;
};

export type TabParamList = {
  Home: undefined;
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
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
