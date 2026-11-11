/**
 * How to use the native bridge in the web app: examples, not app code.
 *
 * Nothing imports this file, so none of it ships. It is a real TypeScript
 * file so the examples are type-checked against the generated contract and
 * cannot silently go out of date.
 *
 * ─── The pieces ─────────────────────────────────────────────────────────────
 *
 * - `nativeBridge` (./nativeBridge.ts): call any native function directly,
 *   `await nativeBridge.platform()`. It waits for the connection, resolves
 *   `null` when there is no native app to answer (a plain browser), and
 *   rejects only on a real failure. Works anywhere: components, services,
 *   plain modules.
 * - Feature hooks such as `usePlatform` (./usePlatform.ts): `useQuery` over a
 *   `nativeBridge` call, for answers a component renders.
 * - The SDK, `@veolms/react-webview-bridge`, is still there underneath:
 *   `useBridgeCall`, `useBridgeEvent`, `useNativeBridge`. They work anywhere
 *   in the app (the `NativeBridgeProvider` is in root.tsx's `Layout`) and use
 *   the same single connection as `nativeBridge`.
 *
 * ─── Where to use what ──────────────────────────────────────────────────────
 *
 * | You want to…                                        | Use                                   |
 * | --------------------------------------------------- | ------------------------------------- |
 * | Call native from a click, effect, service or module | `await nativeBridge.fn(...)`          |
 * | Render a native answer (shared, cached)             | a hook with `useQuery`, e.g. `usePlatform()` |
 * | Run a native action and render its pending/error    | `useMutation` over `nativeBridge.fn`  |
 * | React to an event the native app sends              | SDK `useBridgeEvent`                  |
 * | Show or hide UI by connection state                 | SDK `useNativeBridge<NativeBridgeContract>()` |
 * | Track one call's status without TanStack Query      | SDK `useBridgeCall`                   |
 *
 * Rules that hold for every option:
 * - `null` from a `nativeBridge` call means "no native app here" (or the app
 *   lacks that function). It is normal, not an error: render nothing or a
 *   browser fallback.
 * - Handle rejections (`.catch`, or a query's `error`). They are real
 *   failures: the connection or the call went wrong.
 * - Import the contract's types from "./native-bridge-contracts" where you
 *   need them; it is generated, so never edit it.
 * - Never call `buildNativeBridge`, `bridge.dispose()` or
 *   `clearNativeBridgeCache()` from app code; the SDK owns the connection.
 */
import { useMutation } from "@tanstack/react-query";
import {
  useBridgeCall,
  useBridgeEvent,
  useNativeBridge,
  type BridgeInstance,
} from "@veolms/react-webview-bridge";
import { useState, type ReactNode } from "react";
import type {
  NativeBridgeContract,
  PlatformInfo,
} from "./native-bridge-contracts";
import { nativeBridge } from "./nativeBridge";
import { usePlatform } from "./usePlatform";

// ─── 1. A direct call, from an event handler ─────────────────────────────────
// The simplest form. No hook: `nativeBridge` waits for the connection itself.
// With arguments it reads the same: `await nativeBridge.ns.fn(a, b)`.

export function CopyPlatformButton() {
  const copy = async () => {
    const platform = await nativeBridge.platform();
    if (!platform) return; // plain browser: nothing to copy
    await navigator.clipboard.writeText(`${platform.name} ${platform.release}`);
  };
  return (
    <button type="button" onClick={() => void copy().catch(console.warn)}>
      Copy platform
    </button>
  );
}

// ─── 2. Rendering an answer: a feature hook ──────────────────────────────────
// `usePlatform()` is `useQuery` over `nativeBridge.platform()`. Every
// component that uses it shares one request and one cached answer.

export function PlatformLabel() {
  const { data: platform, isPending, error } = usePlatform();
  if (isPending) return null; // still connecting
  if (error) return <span>Could not reach the app</span>;
  if (!platform) return null; // plain browser
  return (
    <span>
      {platform.name} {platform.release}
    </span>
  );
}

// To write a hook for another native function, copy usePlatform.ts: add a
// key to `nativeBridgeKeys`, and call that function in `queryFn`. Pass its
// arguments through the key too, e.g.
//   queryKey: [...nativeBridgeKeys.all, "fileInfo", path],
//   queryFn: () => nativeBridge.files.info(path),

// ─── 3. An action with pending and error state: useMutation ──────────────────
// For calls that do something (vibrate, share, open a screen) rather than
// read something, so they are not cached.

export function RefreshPlatformButton() {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const refresh = useMutation({
    mutationFn: () => nativeBridge.platform(),
    onSuccess: setPlatform,
  });
  return (
    <button
      type="button"
      disabled={refresh.isPending}
      onClick={() => refresh.mutate()}
    >
      {platform ? platform.name : "Ask the app"}
    </button>
  );
}

// ─── 4. Connection state: SDK useNativeBridge ────────────────────────────────
// For UI that depends on being inside the app at all. `state` is "idle" or
// "initializing" while connecting, "ready", "unavailable" (a plain browser,
// normal), or "error" (`retry()` tries again).

export function InsideAppOnly({ children }: { children: ReactNode }) {
  const { state } = useNativeBridge<NativeBridgeContract>();
  return state === "ready" ? <>{children}</> : null;
}

// ─── 5. Native events: SDK useBridgeEvent ────────────────────────────────────
// The handler always sees the latest props; it unsubscribes on unmount.
// Events sent before the bridge is ready are not replayed. The payload type
// is yours to state (the contract has no events yet); "themeChanged" here is
// only an example name.

export function NativeThemeListener() {
  const [theme, setTheme] = useState<string | null>(null);
  useBridgeEvent<{ theme: string } | null>("themeChanged", (payload) =>
    setTheme(payload?.theme ?? null),
  );
  return theme ? <span>App theme: {theme}</span> : null;
}

// ─── 6. One call's status without TanStack Query: SDK useBridgeCall ──────────
// The raw SDK form. Unlike `nativeBridge`, a plain browser makes `run()`
// reject with a `BridgeNotReadyError` (`reason: "unavailable"`) instead of
// resolving `null`, and the answer is not shared between components. Prefer
// options 2 and 3 in app code.

type Bridge = BridgeInstance<NativeBridgeContract>;

export function PlatformWithBridgeCall() {
  const platform = useBridgeCall((bridge: Bridge) => bridge.platform());
  return (
    <button
      type="button"
      disabled={platform.status === "pending"}
      onClick={() => void platform.run().catch(() => undefined)}
    >
      {platform.data?.name ?? "Ask the app"}
    </button>
  );
}
