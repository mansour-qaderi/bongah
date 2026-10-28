import { launchImageLibrary } from "react-native-image-picker";
import { CHAT_IMAGE_TYPES } from "@bongah/shared-types";

/** What choosing a receipt picture came to. */
export type PickedReceipt =
  | { kind: "picked"; uri: string; contentType: string }
  | { kind: "cancelled" }
  | { kind: "unsupported" }
  | { kind: "failed" };

/** The longest side of the picture sent, in pixels: a receipt screenshot stays readable, a phone photo stays small. */
const MAX_SIDE = 2000;

/**
 * Lets the person choose the picture of their transfer receipt (a screenshot of the HesabPay or bank receipt) from the
 * phone's gallery. The type is checked here so a wrong file is told at once; the server checks the bytes again.
 */
export async function pickReceipt(): Promise<PickedReceipt> {
  let result;
  try {
    result = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: 1,
      includeBase64: false,
      maxWidth: MAX_SIDE,
      maxHeight: MAX_SIDE,
      quality: 0.8,
    });
  } catch {
    return { kind: "failed" };
  }
  if (result.didCancel) return { kind: "cancelled" };
  const asset = result.assets?.[0];
  if (result.errorCode || !asset?.uri) return { kind: "failed" };
  const contentType = asset.type ?? "";
  if (!(CHAT_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return { kind: "unsupported" };
  }
  return { kind: "picked", uri: asset.uri, contentType };
}
