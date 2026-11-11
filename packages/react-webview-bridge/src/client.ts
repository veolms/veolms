import { getBridgeController } from "./controller.ts";
import { BridgeNotReadyError, isBridgeNotReadyError } from "./errors.ts";
import { normalizeEndpointName } from "./presence.ts";
import type { BridgeControllerConfig, RegisteredContract } from "./types.ts";

/**
 * A contract as plain async functions: every native function keeps its arguments and returns a
 * promise of its answer (plus `Empty` when the client resolves `null` outside the native app).
 * Namespaces nest. Native properties are left out (read them inside `controller.call`), and so is
 * anything typed as a promise, which a contract uses for a property getter.
 */
export type BridgeClient<T, Empty = never> = {
  readonly [
    K in keyof T as T[K] extends (...args: never[]) => unknown
      ? K
      : T[K] extends PromiseLike<unknown>
        ? never
        : T[K] extends object
          ? K
          : never
  ]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R> | Empty>
    : BridgeClient<T[K], Empty>;
};

/** Configuration of {@link getBridgeClient}. */
export interface BridgeClientConfig extends BridgeControllerConfig {
  /**
   * What a call answers when there is no native app: a plain browser (the run ends in
   * `unavailable`) or the server, which never has one. `"reject"` (default) rejects with a
   * {@link BridgeNotReadyError} (`reason: "unavailable"`), like every other call of this package;
   * `"null"` resolves `null`, for apps that treat "not in the app" as an ordinary answer.
   */
  unavailable?: "reject" | "null";
}

// Names that must never become native calls: `then` (or `await client.ns` would treat the
// namespace as a promise), and the ones JSON and string conversion look up.
const NOT_NATIVE = new Set(["then", "toJSON", "toString", "valueOf"]);

type NativeFunction = (...args: unknown[]) => unknown;

/**
 * Returns the bridge as one object whose functions you call directly, the counterpart of
 * `await buildNativeBridge()` in plain JS: `await client.ns.fn(...args)`.
 *
 * - Every call waits until the bridge is ready (the provider, or an `acquire()`, starts it), then
 *   calls native. It never throws synchronously.
 * - It works anywhere: components, effects, event handlers, services, plain modules.
 * - It is typed by the contract registered on `Register`, or by `T`.
 * - It looks up the endpoint's controller on every call and never keeps one, so it keeps working
 *   after the last provider unmounts and a new one mounts.
 * - On the server it answers at once (see `unavailable`) instead of waiting out the readiness
 *   timeout: no provider ever connects there.
 *
 * `config.options`/`config.retry` apply only if this client creates the controller ("first call
 * wins"), so pass the same constants the provider gets.
 */
export function getBridgeClient<T extends object = RegisteredContract>(
  endpointName?: string,
  config?: BridgeClientConfig & { unavailable?: "reject" },
): BridgeClient<T>;
export function getBridgeClient<T extends object = RegisteredContract>(
  endpointName: string | undefined,
  config: BridgeClientConfig & { unavailable: "null" },
): BridgeClient<T, null>;
export function getBridgeClient(
  endpointName?: string,
  config?: BridgeClientConfig,
): unknown {
  const name = normalizeEndpointName(endpointName);
  const resolveNull = config?.unavailable === "null";

  const notInApp = (): Promise<null> =>
    resolveNull
      ? Promise.resolve(null)
      : Promise.reject(new BridgeNotReadyError(name, "unavailable", "idle"));

  const forward = (path: readonly string[]): unknown => {
    const invoke = (...args: unknown[]): Promise<unknown> => {
      const member = path[path.length - 1];
      if (member === undefined) {
        return Promise.reject(
          new TypeError(
            "[react-webview-bridge] Call a native function, e.g. client.ns.fn().",
          ),
        );
      }
      if (typeof window === "undefined") return notInApp();
      return getBridgeController(name, config)
        .call((bridge) => {
          const owner = path
            .slice(0, -1)
            .reduce<unknown>(
              (node, key) => (node as Record<string, unknown>)[key],
              bridge,
            ) as Record<string, NativeFunction | undefined>;
          // Returns the call's promise (a value), never a proxy.
          return owner[member]?.(...args);
        })
        .catch((error: unknown) => {
          if (
            resolveNull &&
            isBridgeNotReadyError(error) &&
            error.reason === "unavailable"
          ) {
            return null;
          }
          throw error;
        });
    };
    return new Proxy(invoke, {
      get: (_target, key) =>
        typeof key === "string" && !NOT_NATIVE.has(key)
          ? forward([...path, key])
          : undefined,
    });
  };

  return forward([]);
}
