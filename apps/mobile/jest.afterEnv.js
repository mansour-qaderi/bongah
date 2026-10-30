/* eslint-env jest */
// The app opens in Iran when it cannot tell the country (see src/market/marketStore.ts). Most tests are about Afghan
// screens (afghanis, Afghan provinces, Afghan deals), so every test starts in Afghanistan; a test about Iran, or about
// finding the country, sets its own market (resetMarketForTests / setMarket).
beforeEach(() => {
  require('./src/market/marketStore').resetMarketForTests('AF');
});

// A toast is app-wide state with a timer; one left over from a test would be drawn in the next test's screen.
afterEach(() => {
  require('./src/components/Toast').hideToast();
});
