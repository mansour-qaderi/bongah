import Clipboard from '@react-native-clipboard/clipboard';

/**
 * Puts text on the phone's clipboard (the system's own, so it can be pasted into any app). Returns whether it
 * worked: a failure is something the screen should say, not something to swallow.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
