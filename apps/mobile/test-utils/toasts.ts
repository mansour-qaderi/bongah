import * as Toast from '../src/components/Toast';

/**
 * Records every toast the code under test shows, in order, instead of drawing it. Call it in `beforeEach`/in a test and
 * read `.messages` afterwards; `jest.restoreAllMocks()` (or `.restore()`) puts the real `showToast` back.
 */
export function captureToasts() {
  const spy = jest
    .spyOn(Toast, 'showToast')
    .mockImplementation(() => undefined);
  return {
    get messages(): string[] {
      return spy.mock.calls.map(call => call[0]);
    },
    get calls() {
      return spy.mock.calls;
    },
    clear: () => spy.mockClear(),
    restore: () => spy.mockRestore(),
  };
}
