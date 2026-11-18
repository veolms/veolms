import {
  useNativeBridge,
  type BridgeInstance,
} from "@veolms/react-webview-bridge";

import type {
  GoogleSignInMode,
  GoogleSignInResult,
  NativeBridgeContract,
} from "./native-bridge-contracts";
import { nativeBridge } from "./nativeBridge";

/** The event native sends once the picker has closed and its result waits. */
const GOOGLE_SIGN_IN_FINISHED_EVENT = "googleSignInFinished";

/**
 * How a sign-in with the phone's own Google account picker ended:
 * - `token`: Google's ID token, for the One Tap login request and nothing else
 *   (never logged, stored or put in a URL);
 * - `fallback`: the app cannot do it now, so today's browser sign-in runs;
 * - `noAccount`: `AUTO` found no account it may use without the full picker
 *   (none signed in here before, or Google holds its prompt back for a
 *   while): the page decides, usually the full picker next;
 * - `nothing`: the person closed the picker, or it timed out: the button is
 *   simply usable again.
 */
export type NativeGoogleSignInOutcome =
  | { kind: "token"; idToken: string }
  | { kind: "fallback" }
  | { kind: "noAccount" }
  | { kind: "nothing" };

export interface NativeGoogleSignIn {
  /**
   * Whether the picker can be used for this Google client. Instant: it asks
   * the app and shows nothing. False also when the app gives no answer.
   */
  isSupported(clientId: string): Promise<boolean>;
  /**
   * Shows the picker and waits for the person. No timer of its own: the app
   * has the only time limit and always reports the end. `BUTTON` is the full
   * picker (every account, and adding one); `AUTO` only offers accounts that
   * signed in to this academy before, and may sign in without a tap.
   */
  signIn(
    clientId: string,
    nonce: string,
    mode: GoogleSignInMode,
  ): Promise<NativeGoogleSignInOutcome>;
}

type ReadyBridge = BridgeInstance<NativeBridgeContract>;

/**
 * The phone's own Google account picker, when this page runs in an app build
 * that has it; `null` everywhere else (a browser, an older app, the iOS app,
 * or while the bridge connects), where today's sign-in stays as it is.
 * Decided by `$has` alone, which makes no native call: the apps already on
 * people's phones answer `platform()` but have no `auth` functions.
 */
export function useNativeGoogleSignIn(): NativeGoogleSignIn | null {
  const { bridge } = useNativeBridge();
  if (!bridge?.$has("auth:startGoogleSignIn")) return null;
  return {
    isSupported: (clientId) => isSupported(bridge, clientId),
    signIn: (clientId, nonce, mode) => signIn(bridge, clientId, nonce, mode),
  };
}

async function isSupported(
  bridge: ReadyBridge,
  clientId: string,
): Promise<boolean> {
  if (!bridge.$has("auth:getGoogleSignInSupport")) return true;
  try {
    const support = await bridge.auth.getGoogleSignInSupport({ clientId });
    return support?.supported === true;
  } catch {
    return false;
  }
}

/** What a `start` or `take` answer means for the page. */
function toOutcome(
  result: GoogleSignInResult | null | undefined,
): NativeGoogleSignInOutcome {
  // `null`: this build lacks the function after all. Today's flow.
  if (!result) return { kind: "fallback" };
  const idToken = result.success ? result.data?.idToken : undefined;
  if (idToken) return { kind: "token", idToken };
  if (result.success || result.fallback) return { kind: "fallback" };
  // Only AUTO answers NO_ACCOUNT without `fallback`: the page decides.
  if (result.status === "NO_ACCOUNT") return { kind: "noAccount" };
  return { kind: "nothing" };
}

async function signIn(
  bridge: ReadyBridge,
  clientId: string,
  nonce: string,
  mode: GoogleSignInMode,
): Promise<NativeGoogleSignInOutcome> {
  // Subscribed before the picker opens, so a very fast end is not missed
  // (events are not buffered). Every finished request is remembered, as the
  // event may arrive before the answer that names this request.
  const finished = new Set<string>();
  let wake: (() => void) | null = null;
  const unsubscribe = bridge.onEvent<{ requestId?: string | null } | null>(
    GOOGLE_SIGN_IN_FINISHED_EVENT,
    (payload) => {
      if (!payload?.requestId) return;
      finished.add(payload.requestId);
      wake?.();
    },
  );
  const finishedEvent = async (requestId: string) => {
    while (!finished.has(requestId)) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  };

  try {
    const started = await bridge.auth.startGoogleSignIn({
      clientId,
      nonce,
      mode,
    });
    if (started?.status !== "PENDING") return toOutcome(started);
    // The picker is showing; without the request it cannot be collected.
    if (!started.requestId) return { kind: "fallback" };
    await finishedEvent(started.requestId);
    return toOutcome(
      await bridge.auth.takeGoogleSignInResult({
        requestId: started.requestId,
      }),
    );
  } catch {
    // The bridge itself failed: today's flow.
    return { kind: "fallback" };
  } finally {
    unsubscribe();
  }
}

/**
 * Tells the app the person signed out, so its picker does not reuse their
 * Google account by itself next time. Fire and forget. An app build without
 * the function is not called at all: the bridge answers `null` without
 * calling native, as `$has("auth:signedOut")` would decide, and a browser
 * answers `null` at once.
 */
export function tellNativeSignedOut(): void {
  void nativeBridge.auth.signedOut().catch(() => undefined);
}
