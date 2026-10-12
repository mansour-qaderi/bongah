import type { NavigationProp, ParamListBase } from '@react-navigation/native';

/** Dismisses the whole sign-in modal (the Auth stack's parent is the root stack). */
export function closeAuth(navigation: NavigationProp<ParamListBase>): void {
  const root = navigation.getParent();
  if (root?.canGoBack()) root.goBack();
}
