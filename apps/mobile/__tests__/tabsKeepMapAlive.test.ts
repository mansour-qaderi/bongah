/**
 * Going from "آگهی‌های من" back to "خانه" must not rebuild the map. The tab navigator is what decides that, and its
 * behaviour cannot be exercised without the native screens, so the two settings that matter are pinned here.
 */
describe('the main tab navigator', () => {
  const fs = require('node:fs') as {
    readFileSync(p: string, e: 'utf8'): string;
  };
  const path = require('node:path') as { join(...p: string[]): string };
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'navigation', 'MainTabs.tsx'),
    'utf8',
  );

  it('keeps inactive tabs attached, so the native map view is not torn down and rebuilt when Home comes back', () => {
    expect(source).toMatch(/detachInactiveScreens=\{false\}/);
  });

  it('switches tabs with no cross-fade, so the change is instant', () => {
    expect(source).toMatch(/animation: 'none'/);
    expect(source).not.toMatch(/animation: 'fade'/);
  });

  it('never unmounts a tab when it loses focus', () => {
    expect(source).not.toMatch(/unmountOnBlur/);
    expect(source).not.toMatch(/freezeOnBlur: true/);
  });
});
