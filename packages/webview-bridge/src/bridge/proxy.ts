import { PATH_SEPARATOR } from "../protocol/constants.ts";
import type { BridgeValue } from "../protocol/types.d.ts";
import { BridgeUnsupportedError } from "../transport/errors.ts";
import type {
  BridgeEventHandler,
  NativeTransport,
} from "../transport/types.d.ts";
import type { MetadataRegistry } from "./metadata.ts";
import type { NativeBridgeSession } from "./native-bridge.ts";

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
  // Empty dummy target for Proxy wrapping
  const NativeBridgeProxyTarget = function () {} as unknown as object;

  const proxy = new Proxy(NativeBridgeProxyTarget, {
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

      // 3. Handle inspection and utility methods on root bridge proxy
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

      // Build colon-separated protocol path
      const currentPath =
        basePath === ""
          ? String(prop)
          : `${basePath}${PATH_SEPARATOR}${String(prop)}`;

      // 4. Return an invokable function handler for method calls
      const functionHandler = (
        ...args: unknown[]
      ): Promise<BridgeValue | null> => {
        // Sanitize arguments to JSON-safe BridgeValue array
        const bridgeArgs: BridgeValue[] = args.map((arg) =>
          arg === undefined ? null : (arg as BridgeValue),
        );

        if (metadata.hasCapability(currentPath)) {
          if (metadata.isFunction(currentPath)) {
            return transport.invoke(currentPath, bridgeArgs);
          }
        }

        // NOOP Semantics: If member is in frontend contract but unsupported in native metadata,
        // resolve cleanly according to contract Promise return shape.
        return Promise.resolve(null);
      };

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
        functionHandler,
      );
    },

    set(_target, prop, value) {
      if (typeof prop === "symbol" || prop === "then") {
        return false;
      }

      const currentPath =
        basePath === ""
          ? String(prop)
          : `${basePath}${PATH_SEPARATOR}${String(prop)}`;

      if (metadata.hasCapability(currentPath)) {
        if (!metadata.isWritable(currentPath)) {
          throw new BridgeUnsupportedError(
            `Property "${currentPath}" is read-only on native.`,
          );
        }
        const bridgeValue = value === undefined ? null : (value as BridgeValue);
        // Execute set call asynchronously and swallow rejections to avoid unhandledrejection events in browser
        void transport.set(currentPath, bridgeValue).catch(() => {});
        return true;
      }

      // NOOP for unsupported property setters
      return true;
    },

    apply(_target, _thisArg, argArray) {
      // Handles function invocation when proxy itself is invoked
      if (basePath === "") {
        return undefined;
      }
      const bridgeArgs: BridgeValue[] = argArray.map((arg) =>
        arg === undefined ? null : (arg as BridgeValue),
      );

      if (metadata.hasCapability(basePath)) {
        if (metadata.isFunction(basePath)) {
          return transport.invoke(basePath, bridgeArgs);
        }
      }
      // NOOP
      return Promise.resolve(null);
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
  functionHandler: (...args: unknown[]) => Promise<BridgeValue | null>,
): T {
  return new Proxy(functionHandler as unknown as object, {
    get(_target, prop) {
      if (prop === "then") {
        return undefined;
      }
      if (typeof prop === "symbol") {
        return undefined;
      }

      const childPath = `${currentPath}${PATH_SEPARATOR}${String(prop)}`;

      if (metadata.isProperty(childPath)) {
        if (metadata.isReadable(childPath)) {
          return transport.get(childPath);
        }
        return undefined;
      }

      const childFunctionHandler = (
        ...args: unknown[]
      ): Promise<BridgeValue | null> => {
        const bridgeArgs: BridgeValue[] = args.map((arg) =>
          arg === undefined ? null : (arg as BridgeValue),
        );
        if (
          metadata.hasCapability(childPath) &&
          metadata.isFunction(childPath)
        ) {
          return transport.invoke(childPath, bridgeArgs);
        }
        return Promise.resolve(null);
      };

      return createBridgeProxyInternal(
        transport,
        metadata,
        childPath,
        childFunctionHandler,
      );
    },

    set(_target, prop, value) {
      if (typeof prop === "symbol" || prop === "then") {
        return false;
      }
      const childPath = `${currentPath}${PATH_SEPARATOR}${String(prop)}`;
      if (metadata.hasCapability(childPath)) {
        if (!metadata.isWritable(childPath)) {
          throw new BridgeUnsupportedError(
            `Property "${childPath}" is read-only on native.`,
          );
        }
        const bridgeValue = value === undefined ? null : (value as BridgeValue);
        void transport.set(childPath, bridgeValue).catch(() => {});
        return true;
      }
      return true;
    },

    apply(_target, _thisArg, argArray) {
      return functionHandler(...argArray);
    },
  }) as unknown as T;
}
