import { DEFAULT_BRIDGE_NAME } from "../protocol/constants.ts";
import { createNativeEndpoint } from "../endpoint/native-endpoint.ts";
import { DefaultNativeTransport } from "../transport/native-transport.ts";
import { MetadataRegistry } from "./metadata.ts";
import { NativeBridgeSession } from "./native-bridge.ts";

/**
 * Configuration options for buildNativeBridge().
 */
export interface BuildBridgeOptions {
  /**
   * Enable verbose internal debug logging to browser console.
   */
  debug?: boolean;
  /**
   * Default timeout in milliseconds for native requests (0 or undefined disables timeout).
   */
  timeoutMs?: number;
  /**
   * Optional callback invoked with detailed diagnostic error if bridge initialization fails.
   */
  onInitError?: (error: Error) => void;
}

/**
 * Cache for active bridge sessions keyed by endpoint registration name.
 */
const bridgeCache = new Map<string, NativeBridgeSession>();

/**
 * Map tracking in-flight initialization promises to prevent duplicate concurrent initialization requests.
 */
const initPromises = new Map<string, Promise<NativeBridgeSession>>();

/**
 * Generation counter for invalidating in-flight initialization tasks when clearNativeBridgeCache is called.
 */
let cacheGeneration = 0;

/**
 * Evicts a session from the active session cache by endpoint name if it matches the current owner.
 */
export function evictBridgeSession(
  endpointName: string,
  sessionToEvict?: NativeBridgeSession,
): void {
  const name =
    (typeof endpointName === "string" ? endpointName : "").trim() ||
    DEFAULT_BRIDGE_NAME;
  const current = bridgeCache.get(name);
  if (!sessionToEvict || current === sessionToEvict) {
    bridgeCache.delete(name);
  }
}

/**
 * Constructs or retrieves a cached NativeBridge instance matching frontend contract `T`.
 *
 * Handles endpoint discovery, initialization handshake, capability metadata caching,
 * and concurrent request deduplication.
 *
 * @param endpointName Registration name of the native endpoint (default: "NativeBridge")
 * @param options Build & debug options
 * @returns Promise resolving to typed proxy `T`, or `null` if native endpoint is unavailable.
 */
export async function buildNativeBridge<
  T extends object = Record<string, unknown>,
>(
  endpointName: string = DEFAULT_BRIDGE_NAME,
  options?: BuildBridgeOptions,
): Promise<T | null> {
  const name =
    (typeof endpointName === "string" ? endpointName : "").trim() ||
    DEFAULT_BRIDGE_NAME;

  if (options?.debug) {
    console.log(`[NativeBridge Debug] buildNativeBridge("${name}") requested.`);
  }

  // 1. Return existing active bridge instance if cached
  const existingSession = bridgeCache.get(name);
  if (existingSession) {
    if (options?.debug) {
      console.log(
        `[NativeBridge Debug] Returning cached session for "${name}".`,
      );
    }
    return existingSession.getProxy<T>();
  }

  // 2. Reuse in-flight initialization promise if concurrent initialization is currently running
  const inFlightPromise = initPromises.get(name);
  if (inFlightPromise) {
    try {
      const session = await inFlightPromise;
      return session.getProxy<T>();
    } catch {
      return null;
    }
  }

  // Capture current cache generation to detect cache clearing during init
  const currentGeneration = cacheGeneration;

  // 3. Initiate new bridge session
  const initTask = (async (): Promise<NativeBridgeSession> => {
    const endpoint = createNativeEndpoint(name);
    if (!endpoint) {
      const err = new Error(
        `No native endpoint object found on window for "${name}".`,
      );
      if (options?.onInitError) {
        options.onInitError(err);
      }
      throw err;
    }

    if (options?.debug) {
      console.log(
        `[NativeBridge Debug] Discovered endpoint "${name}" on platform: ${endpoint.platform}`,
      );
    }

    const transport = new DefaultNativeTransport(endpoint, {
      defaultTimeoutMs: options?.timeoutMs,
    });

    try {
      const metadataPayload = await transport.initialize();

      if (currentGeneration !== cacheGeneration) {
        transport.dispose();
        throw new Error(
          `Bridge cache was cleared while endpoint "${name}" was initializing.`,
        );
      }

      const metadataRegistry = new MetadataRegistry(metadataPayload);
      const session = new NativeBridgeSession(
        name,
        transport,
        metadataRegistry,
      );

      bridgeCache.set(name, session);
      return session;
    } catch (err) {
      if (options?.onInitError && err instanceof Error) {
        options.onInitError(err);
      }
      throw err;
    }
  })();

  initPromises.set(name, initTask);

  try {
    const session = await initTask;
    return session.getProxy<T>();
  } catch (error) {
    if (options?.debug) {
      console.warn(
        `[NativeBridge Debug] buildNativeBridge("${name}") failed to initialize:`,
        error,
      );
    }
    return null;
  } finally {
    if (initPromises.get(name) === initTask) {
      initPromises.delete(name);
    }
  }
}

/**
 * Clears cached bridge sessions and disposes underlying transports.
 * Primarily useful for testing or WebView re-navigation teardown.
 */
export function clearNativeBridgeCache(): void {
  cacheGeneration++;
  for (const session of bridgeCache.values()) {
    session.dispose();
  }
  bridgeCache.clear();
  initPromises.clear();
}
