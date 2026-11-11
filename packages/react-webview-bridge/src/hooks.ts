import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { BridgeValue } from "@veolms/webview-bridge";
import { useBridgeController } from "./provider.tsx";
import type {
  BridgeController,
  BridgeInstance,
  BridgeSnapshot,
  ReadyBridge,
  WaitOptions,
} from "./types.ts";

/**
 * Runs before the component's own layout effects (and its children's later ones), so refs it
 * updates are current for anything a layout effect calls. `useEffect` on the server, where
 * React 18 warns about `useLayoutEffect` and neither runs.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Result of {@link useNativeBridge}. */
export interface UseNativeBridgeResult<
  T extends object = Record<string, unknown>,
> extends BridgeSnapshot<T> {
  /** `state === "ready"` (then `bridge` is non-null). */
  readonly isReady: boolean;
  /** Restart after `unavailable`/`error`/reset, or skip a pending backoff delay. */
  readonly retry: () => void;
  /** See {@link BridgeController.call}. */
  readonly call: BridgeController<T>["call"];
  /** See {@link BridgeController.whenReady}. Resolves `{ bridge }`, never the proxy itself. */
  readonly whenReady: (options?: WaitOptions) => Promise<ReadyBridge<T>>;
}

/**
 * Subscribes to the shared bridge of the nearest provider.
 *
 * ```tsx
 * const { state, bridge, error, retry, attempt } = useNativeBridge<MyContract>();
 * ```
 */
export function useNativeBridge<
  T extends object = Record<string, unknown>,
>(): UseNativeBridgeResult<T> {
  const controller = useBridgeController<T>();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return useMemo(
    () => ({
      ...snapshot,
      isReady: snapshot.state === "ready" && snapshot.bridge !== null,
      retry: controller.retry,
      call: controller.call,
      whenReady: controller.whenReady,
    }),
    [snapshot, controller],
  );
}

/** Status of a {@link useBridgeCall} invocation. */
export type BridgeCallStatus = "idle" | "pending" | "success" | "error";

export interface UseBridgeCallResult<A extends unknown[], R> {
  /**
   * Runs the call (queued until ready per `options`). Always returns a promise that rejects on
   * failure (`BridgeNotReadyError` when the bridge never became ready); state is updated too.
   */
  readonly run: (...args: A) => Promise<R>;
  readonly status: BridgeCallStatus;
  /** Result of the latest successful run. */
  readonly data: R | undefined;
  /** Failure of the latest run. */
  readonly error: unknown;
  /** Back to `idle`, clearing `data`/`error`. */
  readonly reset: () => void;
}

/**
 * Wraps a bridge call with readiness queueing and request state.
 * `fn` is read through a ref, so an inline arrow is fine. Only the latest run updates state.
 *
 * ```tsx
 * const info = useBridgeCall((b: BridgeInstance<MyContract>) => b.device.getInfo());
 * <button onClick={() => info.run()}>Load</button>
 * ```
 *
 * Never return the proxy (or a nested proxy) from `fn`.
 */
export function useBridgeCall<T extends object, A extends unknown[], R>(
  fn: (bridge: BridgeInstance<T>, ...args: A) => R | Promise<R>,
  options?: WaitOptions,
): UseBridgeCallResult<A, Awaited<R>> {
  const controller = useBridgeController<T>();
  const fnRef = useRef(fn);
  const optionsRef = useRef(options);
  // A layout effect, not a passive one: the caller's own layout effects may call `run()` and
  // must see this render's `fn` and `options`.
  useIsomorphicLayoutEffect(() => {
    fnRef.current = fn;
    optionsRef.current = options;
  });

  const [state, setState] = useState<{
    status: BridgeCallStatus;
    data: Awaited<R> | undefined;
    error: unknown;
  }>({ status: "idle", data: undefined, error: undefined });
  const latestRun = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A): Promise<Awaited<R>> => {
      const id = ++latestRun.current;
      // The function of the render that started this run, even if the bridge becomes ready
      // only after a later render: the arguments belong to it.
      const fn = fnRef.current;
      setState((prev) => ({ ...prev, status: "pending", error: undefined }));
      try {
        const result = await controller.call(
          (bridge) => fn(bridge, ...args),
          optionsRef.current,
        );
        if (mounted.current && id === latestRun.current) {
          setState({
            status: "success",
            data: result as Awaited<R>,
            error: undefined,
          });
        }
        return result as Awaited<R>;
      } catch (error) {
        if (mounted.current && id === latestRun.current) {
          setState((prev) => ({ ...prev, status: "error", error }));
        }
        throw error;
      }
    },
    [controller],
  );

  const reset = useCallback(() => {
    latestRun.current++;
    setState({ status: "idle", data: undefined, error: undefined });
  }, []);

  return useMemo(() => ({ run, reset, ...state }), [run, reset, state]);
}

export interface UseBridgeEventOptions {
  /** Subscribe only while `true`. Default `true`. */
  enabled?: boolean;
}

/**
 * Subscribes `handler` to native event `eventName` once the bridge is ready.
 * The latest `handler` is always called (no resubscription when it changes); the subscription is
 * removed on unmount, when `eventName`/`enabled` change, and when the bridge instance changes.
 */
export function useBridgeEvent<P = BridgeValue>(
  eventName: string,
  handler: (payload: P) => void,
  options?: UseBridgeEventOptions,
): void {
  const controller = useBridgeController();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const bridge = snapshot.state === "ready" ? snapshot.bridge : null;
  const enabled = options?.enabled ?? true;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!bridge || !enabled) return;
    const unsubscribe = bridge.onEvent<P>(eventName, (payload) =>
      handlerRef.current(payload),
    );
    return () => {
      unsubscribe();
    };
  }, [bridge, eventName, enabled]);
}
