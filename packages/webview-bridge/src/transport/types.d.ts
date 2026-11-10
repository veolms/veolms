import type {
  BridgeMetadataPayload,
  BridgeValue,
} from "../protocol/types.d.ts";

/**
 * Event handler callback for native events.
 */
export type BridgeEventHandler<T = BridgeValue> = (payload: T) => void;

/**
 * Options for configuring NativeTransport behavior.
 */
export interface NativeTransportOptions {
  /**
   * Default timeout in milliseconds for pending requests.
   * Defaults to 30000 ms so a request that native never answers cannot hang forever.
   * Set to 0 to disable timeouts (e.g. for long-running native operations such as downloads),
   * or pass a per-call `timeoutMs`. The init handshake uses this value when it is greater than 0,
   * else 10000 ms (the handshake is never unbounded).
   */
  defaultTimeoutMs?: number;
}

/**
 * Driver-level protocol transport interface.
 * Handles request IDs, promise correlation, timeouts, JSON serialization,
 * event dispatching, session state, and metadata retrieval.
 */
export interface NativeTransport {
  /** Endpoint registration name */
  readonly endpointName: string;

  /** Active session ID established during initialization handshake */
  readonly sessionId: string | null;

  /** Metadata describing native capabilities */
  readonly metadata: BridgeMetadataPayload | null;

  /** Whether the transport has completed initialization handshake */
  readonly isInitialized: boolean;

  /**
   * Performs the initial protocol handshake to establish session and retrieve capability metadata.
   */
  initialize(): Promise<BridgeMetadataPayload>;

  /**
   * Invokes a native function capability asynchronously.
   */
  invoke<T extends BridgeValue = BridgeValue>(
    path: string,
    args?: BridgeValue[],
    timeoutMs?: number,
  ): Promise<T>;

  /**
   * Reads a native property capability asynchronously.
   */
  get<T extends BridgeValue = BridgeValue>(
    path: string,
    timeoutMs?: number,
  ): Promise<T>;

  /**
   * Writes a native property capability asynchronously. Resolves when acknowledged by native.
   */
  set(path: string, value: BridgeValue, timeoutMs?: number): Promise<void>;

  /**
   * Subscribes a listener to unsolicited native events by event name.
   * Returns an unsubscribe function.
   */
  onEvent<T = BridgeValue>(
    eventName: string,
    handler: BridgeEventHandler<T>,
  ): () => void;

  /**
   * Disposes the transport, cancelling pending requests and tearing down endpoint listeners.
   */
  dispose(): void;
}
