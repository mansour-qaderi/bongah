/* eslint-env jest */
// A toast is app-wide state with a timer; one left over from a test would be drawn in the next test's screen.
afterEach(() => {
  require('./src/components/Toast').hideToast();
});
