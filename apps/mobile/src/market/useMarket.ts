import { useEffect, useState } from 'react';
import { FALLBACK_MARKET } from '@bongah/shared-types';
import { updatePreferences } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { detectMarket } from './detect';
import {
  isMarketKnown,
  loadMarket,
  setMarket,
  useActiveMarket,
} from './marketStore';

export { useActiveMarket } from './marketStore';

/**
 * Finds the person's country and keeps the market of the account and the market on the phone together. Mount once, near
 * the root. The country is never asked: it is the country the phone is in; when location is off or gives nothing, the
 * last country found is kept, and on a first start it is Iran. Signed in, the account follows that country (so the
 * website and another phone agree).
 */
export function useMarketSync(): void {
  const { user, updateUser } = useAuth();
  const accountMarket = user?.market;
  const market = useActiveMarket();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let stopped = false;
    (async () => {
      await loadMarket();
      const found = await detectMarket();
      if (stopped) return;
      if (found) await setMarket(found);
      else if (!isMarketKnown()) await setMarket(FALLBACK_MARKET);
      setSettled(true);
    })();
    return () => {
      stopped = true;
    };
  }, []);

  // The account follows the country the phone is in. Saved quietly: if the server says no, the phone still shows the
  // right country and tries again next start.
  useEffect(() => {
    if (!settled || !accountMarket) return;
    if (accountMarket === market) return;
    updatePreferences({ market })
      .then(updated => updateUser(updated))
      .catch(() => undefined);
  }, [settled, accountMarket, market, updateUser]);
}
