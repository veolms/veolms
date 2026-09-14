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
   * Optional default timeout duration in milliseconds for pending requests.
   * If set to 0 or undefined, requests do not time out by default, allowing
   * long-running native operations (e.g. downloadFile) to complete.
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
