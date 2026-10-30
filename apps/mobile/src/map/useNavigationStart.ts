import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LocationProblem } from '../components/LocationPermissionModal';
import { showToast } from '../components/Toast';
import { marketText } from '../i18n/market';
import { getMarket } from '../market/marketStore';
import { locate } from './location';

/**
 * "مسیریابی": the steps before the route screen opens, the same wherever the button is (the listing's page, its card on
 * the Home map). No position, no route: a line drawn from nowhere (or from the middle of the country) would be a wrong
 * answer that looks right. So the phone is asked where it is first. Only a real fix inside Afghanistan calls `onReady`
 * (the caller opens the route screen); a refusal or a switched-off GPS sets `problem` (the caller shows the card that
 * explains and leads to the settings, with `openSettings` and `closeProblem`), and a phone abroad is told that
 * directions are not possible from there. Coming back from the phone's settings after allowing location tries again.
 */
export function useNavigationStart(onReady: () => void) {
  const { t } = useTranslation();
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const awaitingSettings = useRef(false);
  const mounted = useRef(true);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const start = useCallback(async () => {
    setFinding(true);
    const found = await locate({ ask: true });
    if (!mounted.current) return;
    setFinding(false);
    if (found.status === 'ok') ready.current();
    else if (found.status === 'outside') showToast(marketText(t, 'route.outside', getMarket()), 'info');
    else setProblem(found.status);
  }, [t]);

  // Back from the phone's settings after allowing location: try again, the person may just have switched it on.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && awaitingSettings.current) {
        awaitingSettings.current = false;
        start();
      }
    });
    return () => subscription.remove();
  }, [start]);

  const openSettings = useCallback(() => {
    awaitingSettings.current = true;
    const kind = problem;
    setProblem(null);
    // A switched-off GPS has its own settings page on Android; everything else is the app's page.
    if (kind === 'unavailable' && Platform.OS === 'android') {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(
        () => Linking.openSettings(),
      );
    } else {
      Linking.openSettings();
    }
  }, [problem]);

  const closeProblem = useCallback(() => setProblem(null), []);

  return { start, finding, problem, openSettings, closeProblem };
}
