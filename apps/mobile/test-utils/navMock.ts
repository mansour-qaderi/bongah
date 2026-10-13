/**
 * Components that call useNavigation() (the contact and chat parts) need a navigation object.
 * Tests that render them without a NavigationContainer swap the hook for this one:
 *
 *   jest.mock('@react-navigation/native', () => require('../test-utils/navMock').navigationModule());
 *
 * and then read `mockNavigation.navigate` to see where the screen tried to go.
 */
export const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn(() => () => undefined),
};

export const navigationModule = () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
});
