import type { NativeEndpoint } from "../endpoint/types.d.ts";
import {
  decodeBridgeMessage,
  encodeBridgeMessage,
  isBridgeEvent,
  isBridgeReply,
  normalizeBridgeValue,
} from "../protocol/codec.ts";
import {
  CLIENT_VERSION,
  OPERATIONS,
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  REPLY_STATUS,
} from "../protocol/constants.ts";
import type {
  BridgeEvent,
  BridgeInitPayload,
  BridgeInitRequest,
  BridgeMetadataPayload,
  BridgeReply,
  BridgeRequest,
  BridgeValue,
} from "../protocol/types.d.ts";
import {
  BridgeError,
  BridgeInitializationError,
  BridgeNativeError,
  BridgeProtocolError,
  BridgeTimeoutError,
  BridgeTransportError,
} from "./errors.ts";
import type {
  BridgeEventHandler,
  NativeTransport,
  NativeTransportOptions,
} from "./types.d.ts";

/**
 * Default timeout for invoke/get/set requests when no `defaultTimeoutMs` is configured.
 * Pass `defaultTimeoutMs: 0` to disable timeouts (e.g. for long-running native operations).
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Timeout for the initialization handshake when no explicit `defaultTimeoutMs` is configured.
 */
const DEFAULT_INIT_TIMEOUT_MS = 10000;

/**
 * Internal pending request tracker entry.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: BridgeError) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Robust RFC4122 v4 UUID generator with standard crypto.randomUUID and fallback mechanism.
 */
export function generateUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if crypto.randomUUID is restricted in certain WebViews
    }
  }

  // Fallback UUID v4 generator using Math.random
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Default implementation of NativeTransport protocol driver.
 */
export class DefaultNativeTransport implements NativeTransport {
  public readonly endpoint: NativeEndpoint;
  private readonly options: Required<NativeTransportOptions>;

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly eventSubscribers = new Map<
    string,
    Set<BridgeEventHandler>
  >();

  private endpointUnsubscribe: (() => void) | null = null;
  private metadataPayload: BridgeMetadataPayload | null = null;
  private readonly explicitTimeoutMs: number | undefined;
  private activeSessionId: string | null = null;
  private isDisposed = false;

  constructor(endpoint: NativeEndpoint, options?: NativeTransportOptions) {
    this.endpoint = endpoint;
    this.explicitTimeoutMs = options?.defaultTimeoutMs;
    this.options = {
      defaultTimeoutMs: options?.defaultTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    };
    this.attachEndpointListener();
  }

  public get endpointName(): string {
    return this.endpoint.name;
  }

  public get metadata(): BridgeMetadataPayload | null {
    return this.metadataPayload;
  }

  public get isInitialized(): boolean {
    return this.metadataPayload !== null;
  }

  public get sessionId(): string | null {
    return this.activeSessionId;
  }

  public async initialize(): Promise<BridgeMetadataPayload> {
    if (this.isDisposed) {
      throw new BridgeTransportError(
        `Transport for endpoint "${this.endpoint.name}" is disposed.`,
      );
    }

    if (this.metadataPayload) {
      return this.metadataPayload;
    }

    const initTimeout =
      this.explicitTimeoutMs !== undefined && this.explicitTimeoutMs > 0
        ? this.explicitTimeoutMs
        : DEFAULT_INIT_TIMEOUT_MS;
    const jsSessionId = generateUUID();

    try {
      const replyPayload = await this.sendRequest<BridgeMetadataPayload>(
        OPERATIONS.INIT,
        undefined,
        {
          bridgeName: this.endpoint.name,
          clientVersion: CLIENT_VERSION,
          sessionId: jsSessionId,
        },
        initTimeout,
      );

      if (!replyPayload || typeof replyPayload !== "object") {
        throw new BridgeInitializationError(
          `Initialization reply payload for endpoint "${this.endpoint.name}" is invalid or null.`,
        );
      }

      const metadataPayload = replyPayload as BridgeMetadataPayload;

      if (
        !metadataPayload.protocolVersion ||
        metadataPayload.protocolVersion !== PROTOCOL_VERSION
      ) {
        throw new BridgeInitializationError(
          `Incompatible bridge protocol version: native reported version ${metadataPayload.protocolVersion}, expected ${PROTOCOL_VERSION}.`,
        );
      }

      // Use native's returned sessionId if available, otherwise fall back to JS-generated sessionId
      const finalSessionId =
        metadataPayload.sessionId && metadataPayload.sessionId.trim() !== ""
          ? metadataPayload.sessionId
          : jsSessionId;

      const normalizedMetadata: BridgeMetadataPayload = {
        ...metadataPayload,
        sessionId: finalSessionId,
      };

      if (!Array.isArray(normalizedMetadata.capabilities)) {
        throw new BridgeInitializationError(
          `Initialization reply for endpoint "${this.endpoint.name}" has no capabilities array.`,
        );
      }

      this.metadataPayload = normalizedMetadata;
      this.activeSessionId = finalSessionId;
      return normalizedMetadata;
    } catch (err) {
      if (err instanceof BridgeError) {
        throw err;
      }
      throw new BridgeInitializationError(
        `Failed to initialize bridge transport for endpoint "${this.endpoint.name}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  public async invoke<T extends BridgeValue = BridgeValue>(
    path: string,
    args?: BridgeValue[],
    timeoutMs?: number,
  ): Promise<T> {
    const wireArgs = this.normalizeOutbound(
      () =>
        (args ?? []).map((arg, i) =>
          normalizeBridgeValue(arg, `argument ${i}`),
        ),
      path,
    );
    return this.sendRequest<T>(OPERATIONS.INVOKE, path, wireArgs, timeoutMs);
  }

  public async get<T extends BridgeValue = BridgeValue>(
    path: string,
    timeoutMs?: number,
  ): Promise<T> {
    return this.sendRequest<T>(OPERATIONS.GET, path, undefined, timeoutMs);
  }

  public async set(
    path: string,
    value: BridgeValue,
    timeoutMs?: number,
  ): Promise<void> {
    const wireValue = this.normalizeOutbound(
      () => normalizeBridgeValue(value, "value"),
      path,
    );
    await this.sendRequest<void>(OPERATIONS.SET, path, wireValue, timeoutMs);
  }

  /**
   * Validates outbound values before they are serialized, turning lossy or unserializable values
   * into a `BridgeProtocolError` instead of silent data loss or a raw `TypeError`.
   */
  private normalizeOutbound<V>(convert: () => V, path: string): V {
    try {
      return convert();
    } catch (err) {
      throw new BridgeProtocolError(
        `Invalid outbound value for "${path}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public onEvent<T = BridgeValue>(
    eventName: string,
    handler: BridgeEventHandler<T>,
  ): () => void {
    if (this.isDisposed) {
      return () => {};
    }

    let subscribers = this.eventSubscribers.get(eventName);
    if (!subscribers) {
      subscribers = new Set();
      this.eventSubscribers.set(eventName, subscribers);
    }

    const genericHandler = handler as unknown as BridgeEventHandler;
    subscribers.add(genericHandler);

    return () => {
      const set = this.eventSubscribers.get(eventName);
      if (set) {
        set.delete(genericHandler);
        if (set.size === 0) {
          this.eventSubscribers.delete(eventName);
        }
      }
    };
  }

  private async sendRequest<T>(
    operation: "init" | "invoke" | "get" | "set",
    path?: string,
    payloadOrValueOrArgs?: unknown,
    overrideTimeoutMs?: number,
  ): Promise<T> {
    if (this.isDisposed) {
      throw new BridgeTransportError(
        `Transport for endpoint "${this.endpoint.name}" is disposed.`,
      );
    }

    const id = generateUUID();
    const request = this.buildRequestObject(
      operation,
      id,
      path,
      payloadOrValueOrArgs,
    );
    const rawMessage = encodeBridgeMessage(request);

    const timeoutMs = overrideTimeoutMs ?? this.options.defaultTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new BridgeTimeoutError(id, timeoutMs));
        }, timeoutMs);
      }

      this.pendingRequests.set(id, {
        resolve: (val: unknown) => {
          if (timer) clearTimeout(timer);
          resolve(val as T);
        },
        reject: (err: BridgeError) => {
          if (timer) clearTimeout(timer);
          reject(err);
        },
        timer,
      });

      try {
        this.endpoint.postMessage(rawMessage);
      } catch (err) {
        this.pendingRequests.delete(id);
        if (timer) clearTimeout(timer);
        reject(
          new BridgeTransportError(
            `Failed to transmit message over endpoint "${this.endpoint.name}": ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }
    });
  }

  private buildRequestObject(
    operation: "init" | "invoke" | "get" | "set",
    id: string,
    path?: string,
    payloadOrValueOrArgs?: unknown,
  ): BridgeRequest {
    if (operation === OPERATIONS.INIT) {
      const payloadObj = payloadOrValueOrArgs as BridgeInitPayload;
      const initReq: BridgeInitRequest = {
        type: MESSAGE_TYPES.REQUEST,
        operation: OPERATIONS.INIT,
        id,
        protocolVersion: PROTOCOL_VERSION,
        payload: {
          bridgeName: payloadObj.bridgeName,
          clientVersion: payloadObj.clientVersion,
          sessionId: payloadObj.sessionId,
        },
      };
      return initReq;
    }

    if (operation === OPERATIONS.INVOKE) {
      return {
        type: MESSAGE_TYPES.REQUEST,
        operation: OPERATIONS.INVOKE,
        id,
        payload: {
          path: path ?? "",
          args: (payloadOrValueOrArgs as BridgeValue[]) ?? [],
          sessionId: this.activeSessionId ?? undefined,
        },
      };
    }

    if (operation === OPERATIONS.GET) {
      return {
        type: MESSAGE_TYPES.REQUEST,
        operation: OPERATIONS.GET,
        id,
        payload: {
          path: path ?? "",
          sessionId: this.activeSessionId ?? undefined,
        },
      };
    }

    // set operation
    return {
      type: MESSAGE_TYPES.REQUEST,
      operation: OPERATIONS.SET,
      id,
      payload: {
        path: path ?? "",
        value: payloadOrValueOrArgs as BridgeValue,
        sessionId: this.activeSessionId ?? undefined,
      },
    };
  }

  private attachEndpointListener(): void {
    this.endpointUnsubscribe = this.endpoint.onMessage((rawMessage: string) => {
      this.handleIncomingRawMessage(rawMessage);
    });
  }

  private handleIncomingRawMessage(rawMessage: string): void {
    if (this.isDisposed) {
      return;
    }

    const decoded = decodeBridgeMessage(rawMessage);
    if (!decoded) {
      // Ignore invalid or unparseable JSON silently
      return;
    }

    if (isBridgeReply(decoded)) {
      this.processReply(decoded);
    } else if (isBridgeEvent(decoded)) {
      this.processEvent(decoded);
    }
  }

  private processReply(reply: BridgeReply): void {
    const pending = this.pendingRequests.get(reply.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(reply.id);

    if (reply.status === REPLY_STATUS.ERROR || reply.error) {
      const errorPayload = reply.error ?? {
        code: "NATIVE_ERROR",
        message: "Native reported error status without payload.",
      };
      pending.reject(
        new BridgeNativeError(
          errorPayload.message,
          errorPayload.code,
          errorPayload.details,
        ),
      );
    } else if (
      reply.type === MESSAGE_TYPES.ACK ||
      reply.status === REPLY_STATUS.ACK ||
      (reply.status === REPLY_STATUS.SUCCESS && reply.result === undefined)
    ) {
      // Void return type resolves cleanly to undefined (void in JS/TS)
      pending.resolve(undefined);
    } else {
      // Explicit value return type (including null, string, number, object, array, boolean)
      pending.resolve(reply.result);
    }
  }

  private processEvent(event: BridgeEvent): void {
    const subscribers = this.eventSubscribers.get(event.name);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const handler of Array.from(subscribers)) {
      try {
        handler(event.payload);
      } catch (error) {
        // Isolate subscriber errors from each other, but never hide them.
        if (
          typeof console !== "undefined" &&
          typeof console.error === "function"
        ) {
          console.error(
            `Unhandled exception in native event handler for "${event.name}":`,
            error,
          );
        }
      }
    }
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    if (this.endpointUnsubscribe) {
      this.endpointUnsubscribe();
      this.endpointUnsubscribe = null;
    }

    for (const pending of this.pendingRequests.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(
        new BridgeTransportError(
          `Native transport for endpoint "${this.endpoint.name}" was disposed.`,
        ),
      );
    }

    this.pendingRequests.clear();
    this.eventSubscribers.clear();
    this.metadataPayload = null;

    // Clean up underlying endpoint (removes window message listeners and callback properties)
    this.endpoint.dispose();
  }
}
