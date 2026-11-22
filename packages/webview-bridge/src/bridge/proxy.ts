import { PATH_SEPARATOR } from "../protocol/constants.ts";
import type { BridgeValue } from "../protocol/types.d.ts";
import {
  BridgeReadOnlyError,
  BridgeTransportError,
} from "../transport/errors.ts";
import type {
  BridgeEventHandler,
  NativeTransport,
} from "../transport/types.d.ts";
import type { MetadataRegistry } from "./metadata.ts";
import type { NativeBridgeSession } from "./native-bridge.ts";

/**
 * Reports failures of fire-and-forget property assignments (`bridge.ns.prop = value`).
 */
type AssignmentErrorReporter = (error: unknown, path: string) => void;

/**
 * Explicit helpers available at every level of the bridge. `$` can never appear in a native
 * member name (native identifiers are `[A-Za-z_][A-Za-z0-9_]*`), so these never shadow native members.
 *
 * - `$get(name)`: reads a property (resolves `null` when native does not expose a readable property).
 * - `$set(name, value)`: writes a property and resolves once native acknowledged it; rejects with
 *   native/transport errors or `BridgeReadOnlyError` (unlike the fire-and-forget assignment).
 * - `$has(name?)`: whether native exposes `name` (or this namespace) — explicit feature detection,
 *   since unsupported functions resolve `null` (NOOP) instead of failing. `false` once disposed.
 * - `$disposed`: `true` once the bridge was disposed (a boolean, not a function). A disposed bridge
 *   rejects every call (NOOP members included) with `BridgeTransportError`; build a new one instead.
 *
 * The root proxy additionally reserves `toString`, `toJSON`, `onEvent` and `dispose`
 * (see `RESERVED_ROOT_NAMES`).
 */
const HELPER_NAMES = new Set(["$get", "$set", "$has", "$disposed"]);

function joinPath(basePath: string, prop: string): string {
  return basePath === "" ? prop : `${basePath}${PATH_SEPARATOR}${prop}`;
}

function toBridgeArgs(args: unknown[]): BridgeValue[] {
  // `undefined` → `null` (JSON has no undefined); deeper validation happens in the transport.
  return args.map((arg) => (arg === undefined ? null : (arg as BridgeValue)));
}

function defaultAssignmentErrorReporter(error: unknown, path: string): void {
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[NativeBridge] Writing property "${path}" failed:`, error);
  }
}

/**
 * Shared, path-independent behaviour of root and nested proxies.
 */
function createPathOperations(
  transport: NativeTransport,
  metadata: MetadataRegistry,
  reportAssignmentError: AssignmentErrorReporter,
) {
  const disposedError = (path: string): BridgeTransportError =>
    new BridgeTransportError(
      `Native bridge "${transport.endpointName}" is disposed; "${path}" is no longer available.`,
    );

  const invoke = (
    path: string,
    args: unknown[],
  ): Promise<BridgeValue | null> => {
    if (transport.isDisposed) {
      return Promise.reject(disposedError(path));
    }
    if (metadata.hasCapability(path) && metadata.isFunction(path)) {
      return transport.invoke(path, toBridgeArgs(args));
    }
    // NOOP Semantics: If member is in frontend contract but unsupported in native metadata,
    // resolve cleanly according to contract Promise return shape.
    return Promise.resolve(null);
  };

  const write = (path: string, value: unknown): Promise<void> => {
    if (transport.isDisposed) {
      return Promise.reject(disposedError(path));
    }
    if (!metadata.hasCapability(path)) {
      // NOOP for unsupported property setters
      return Promise.resolve();
    }
    if (!metadata.isWritable(path)) {
      return Promise.reject(new BridgeReadOnlyError(path));
    }
    const bridgeValue = value === undefined ? null : (value as BridgeValue);
    return transport.set(path, bridgeValue);
  };

  /** Proxy `set` trap behaviour: synchronous read-only error, async errors reported (not swallowed). */
  const assign = (path: string, value: unknown): boolean => {
    if (metadata.hasCapability(path) && !metadata.isWritable(path)) {
      throw new BridgeReadOnlyError(path);
    }
    // Avoid unhandledrejection events in the browser while still surfacing failures.
    void write(path, value).catch((error: unknown) =>
      reportAssignmentError(error, path),
    );
    return true;
  };

  const has = (path: string): boolean =>
    !transport.isDisposed &&
    (metadata.hasCapability(path) || metadata.isNamespace(path));

  const helper = (basePath: string, name: string): unknown => {
    switch (name) {
      case "$get":
        return (member: string): Promise<BridgeValue | null> => {
          const path = joinPath(basePath, String(member));
          if (transport.isDisposed) {
            return Promise.reject(disposedError(path));
          }
          if (metadata.isProperty(path) && metadata.isReadable(path)) {
            return transport.get(path);
          }
          return Promise.resolve(null);
        };
      case "$disposed":
        return transport.isDisposed;
      case "$set":
        return (member: string, value: unknown): Promise<void> =>
          write(joinPath(basePath, String(member)), value);
      case "$has":
        return (member?: string): boolean =>
          member === undefined
            ? basePath === ""
              ? !transport.isDisposed
              : has(basePath)
            : has(joinPath(basePath, String(member)));
      default:
        return undefined;
    }
  };

  /** Traps that make `in`, `Object.keys`, spread and devtools reflect native capabilities. */
  const reflectionTraps = (basePath: string): ProxyHandler<object> => ({
    has(target, prop) {
      if (typeof prop === "symbol" || prop === "then") {
        return Reflect.has(target, prop);
      }
      return (
        HELPER_NAMES.has(prop) ||
        has(joinPath(basePath, prop)) ||
        Reflect.has(target, prop)
      );
    },
    ownKeys() {
      return transport.isDisposed ? [] : metadata.childrenOf(basePath);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (
        typeof prop === "string" &&
        prop !== "then" &&
        has(joinPath(basePath, prop))
      ) {
        // Values are resolved lazily through the `get` trap (reading a property calls native).
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: undefined,
        };
      }
      const own = Reflect.getOwnPropertyDescriptor(target, prop);
      // Hide the dummy target's own `length`/`name` so they do not look like native members.
      return own?.configurable ? undefined : own;
    },
  });

  return { invoke, assign, helper, reflectionTraps };
}

/**
 * Creates a developer-facing Proxy object for NativeBridge.
 * Translates JavaScript property paths (e.g. `bridge.systemBars.hideStatusBar()`)
 * into protocol paths (`systemBars:hideStatusBar`).
 * Enforces NOOP semantics for contract members missing in runtime metadata.
 * Safely handles `then`, symbols, and inspection methods.
 */
export function createBridgeProxy<T extends object>(
  transport: NativeTransport,
  metadata: MetadataRegistry,
  basePath: string = "",
  session?: NativeBridgeSession,
): T {
  const reportAssignmentError: AssignmentErrorReporter =
    session?.onAssignmentError ?? defaultAssignmentErrorReporter;
  const ops = createPathOperations(transport, metadata, reportAssignmentError);

  // Empty callable dummy target for Proxy wrapping (arrow function: no non-configurable `prototype`).
  const NativeBridgeProxyTarget = (() => undefined) as unknown as object;

  const proxy = new Proxy(NativeBridgeProxyTarget, {
    ...ops.reflectionTraps(basePath),

    get(_target, prop) {
      // 1. Prevent Proxy from acting like a Promise when awaited
      if (prop === "then") {
        return undefined;
      }

      // 2. Handle JS Symbols gracefully
      if (typeof prop === "symbol") {
        if (prop === Symbol.toStringTag) {
          return `NativeBridge(${transport.endpointName})`;
        }
        return undefined;
      }

      // 3. Handle inspection and utility methods on root bridge proxy (RESERVED_ROOT_NAMES)
      if (basePath === "") {
        if (prop === "toString") {
          return () => `[NativeBridge ${transport.endpointName}]`;
        }
        if (prop === "toJSON") {
          return () => ({
            endpoint: transport.endpointName,
            sessionId: transport.sessionId,
            protocolVersion: metadata.protocolVersion,
          });
        }
        if (prop === "onEvent") {
          return (eventName: string, handler: BridgeEventHandler) =>
            transport.onEvent(eventName, handler);
        }
        if (prop === "dispose") {
          return () => (session ? session.dispose() : transport.dispose());
        }
      }

      // 4. Explicit helpers ($get / $set / $has)
      if (HELPER_NAMES.has(prop)) {
        return ops.helper(basePath, prop);
      }

      // Build colon-separated protocol path
      const currentPath = joinPath(basePath, prop);

      // 5. If metadata explicitly marks this path as a Property, read property value
      if (metadata.isProperty(currentPath)) {
        if (metadata.isReadable(currentPath)) {
          return transport.get(currentPath);
        }
        // Write-only property returns undefined when read directly
        return undefined;
      }

      // 6. Support function calls directly on the property
      return createBridgeProxyInternal(
        transport,
        metadata,
        currentPath,
        ops,
        (...args: unknown[]) => ops.invoke(currentPath, args),
      );
    },

    set(_target, prop, value) {
      if (typeof prop === "symbol" || prop === "then") {
        return false;
      }
      return ops.assign(joinPath(basePath, prop), value);
    },

    apply(_target, _thisArg, argArray) {
      // Handles function invocation when proxy itself is invoked
      if (basePath === "") {
        return undefined;
      }
      return ops.invoke(basePath, argArray);
    },
  });

  return proxy as unknown as T;
}

/**
 * Internal nested proxy creation helper connecting function invocation & path traversal.
 */
function createBridgeProxyInternal<T extends object>(
  transport: NativeTransport,
  metadata: MetadataRegistry,
  currentPath: string,
  ops: ReturnType<typeof createPathOperations>,
  functionHandler: (...args: unknown[]) => Promise<BridgeValue | null>,
): T {
  return new Proxy(functionHandler as unknown as object, {
    ...ops.reflectionTraps(currentPath),

    get(_target, prop) {
      if (prop === "then") {
        return undefined;
      }
      if (typeof prop === "symbol") {
        return undefined;
      }
      if (HELPER_NAMES.has(prop)) {
        return ops.helper(currentPath, prop);
      }

      const childPath = joinPath(currentPath, prop);

      if (metadata.isProperty(childPath)) {
        if (metadata.isReadable(childPath)) {
          return transport.get(childPath);
        }
        return undefined;
      }

      return createBridgeProxyInternal(
        transport,
        metadata,
        childPath,
        ops,
        (...args: unknown[]) => ops.invoke(childPath, args),
      );
    },

    set(_target, prop, value) {
      if (typeof prop === "symbol" || prop === "then") {
        return false;
      }
      return ops.assign(joinPath(currentPath, prop), value);
    },

    apply(_target, _thisArg, argArray) {
      return functionHandler(...argArray);
    },
  }) as unknown as T;
}
