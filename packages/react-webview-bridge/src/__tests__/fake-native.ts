/**
 * Test double for the native side of the bridge protocol (v1), installable on `window` as an
 * Android modern (WebMessageListener) or legacy (addJavascriptInterface) endpoint.
 */
import type { BridgeCapabilityPayload } from "@veolms/webview-bridge";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface WireRequest {
  type: "request";
  operation: "init" | "invoke" | "get" | "set";
  id: string;
  protocolVersion?: number;
  payload: {
    path?: string;
    args?: Json[];
    value?: Json;
    sessionId?: string;
    bridgeName?: string;
  };
}

export interface FakeNativeOptions {
  name?: string;
  mode?: "modern" | "legacy";
  capabilities?: BridgeCapabilityPayload[];
  /** Invoke handlers by protocol path; return `undefined` for an ack (void). Throw for an error reply. */
  handlers?: Record<string, (...args: Json[]) => Json | undefined>;
  /** Property values by protocol path (get/set). */
  properties?: Record<string, Json>;
  /** How native answers `init`. */
  init?: "ok" | "bad-version" | "error" | "silent";
  /** Delay of every reply in ms (async delivery). Legacy with 0 answers synchronously. */
  replyDelayMs?: number;
}

export interface FakeNative {
  readonly name: string;
  readonly requests: WireRequest[];
  readonly initCount: number;
  readonly invokeCount: number;
  /** Number of JS message listeners currently attached (modern only). */
  readonly listenerCount: number;
  emit(eventName: string, payload: Json): void;
  uninstall(): void;
}

export const DEFAULT_CAPABILITIES: BridgeCapabilityPayload[] = [
  { path: "device", kind: "namespace" },
  { path: "device:getInfo", kind: "function" },
  { path: "device:vibrate", kind: "function" },
  { path: "app:version", kind: "property", readable: true, writable: false },
];

export function installFakeNative(options: FakeNativeOptions = {}): FakeNative {
  const name = options.name ?? "NativeBridge";
  const mode = options.mode ?? "modern";
  const delay = options.replyDelayMs ?? 0;
  const capabilities = options.capabilities ?? DEFAULT_CAPABILITIES;
  const handlers: Record<string, (...args: Json[]) => Json | undefined> =
    options.handlers ?? {
      "device:getInfo": () => ({ model: "FakePhone", sdk: 34 }),
      "device:vibrate": () => undefined,
    };
  const properties: Record<string, Json> = {
    "app:version": "1.0.0",
    ...options.properties,
  };
  const requests: WireRequest[] = [];
  const listeners = new Set<(event: { data: unknown }) => void>();
  const win = window as unknown as Record<string, unknown>;
  const legacyCallback = `__${name}_legacy_receive__`;

  const deliver = (message: object): void => {
    const raw = JSON.stringify(message);
    if (mode === "modern") {
      for (const listener of Array.from(listeners)) listener({ data: raw });
    } else {
      const receive = win[legacyCallback];
      if (typeof receive === "function") (receive as (m: string) => void)(raw);
    }
  };

  const answer = (request: WireRequest): object | null => {
    const base = {
      type: "reply",
      operation: request.operation,
      id: request.id,
    };
    switch (request.operation) {
      case "init":
        if (options.init === "silent") return null;
        if (options.init === "error") {
          return {
            ...base,
            status: "error",
            error: { code: "INIT_REJECTED", message: "native refused" },
          };
        }
        return {
          ...base,
          status: "success",
          result: {
            protocolVersion: options.init === "bad-version" ? 99 : 1,
            bridgeVersion: "fake-1",
            sessionId: `native-${request.id.slice(0, 8)}`,
            capabilities: capabilities as unknown as Json,
          },
        };
      case "invoke": {
        const path = request.payload.path ?? "";
        const handler = handlers[path];
        if (!handler) {
          return {
            ...base,
            status: "error",
            error: { code: "NOT_FOUND", message: `no handler ${path}` },
          };
        }
        try {
          const result = handler(...(request.payload.args ?? []));
          return result === undefined
            ? { ...base, status: "ack" }
            : { ...base, status: "success", result };
        } catch (error) {
          return {
            ...base,
            status: "error",
            error: { code: "HANDLER_ERROR", message: String(error) },
          };
        }
      }
      case "get":
        return {
          ...base,
          status: "success",
          result: properties[request.payload.path ?? ""] ?? null,
        };
      case "set":
        properties[request.payload.path ?? ""] = request.payload.value ?? null;
        return { ...base, status: "ack" };
    }
  };

  const postMessage = (raw: string): string | undefined => {
    const request = JSON.parse(raw) as WireRequest;
    requests.push(request);
    const reply = answer(request);
    if (!reply) return undefined;
    if (mode === "legacy" && delay === 0) return JSON.stringify(reply);
    setTimeout(() => deliver(reply), delay);
    return undefined;
  };

  if (mode === "modern") {
    win[name] = {
      postMessage: (raw: string) => {
        postMessage(raw);
      },
      onmessage: null,
      addEventListener: (
        _type: string,
        listener: (event: { data: unknown }) => void,
      ) => {
        listeners.add(listener);
      },
      removeEventListener: (
        _type: string,
        listener: (event: { data: unknown }) => void,
      ) => {
        listeners.delete(listener);
      },
    };
  } else {
    win[name] = { postMessage };
  }

  return {
    name,
    requests,
    get initCount() {
      return requests.filter((r) => r.operation === "init").length;
    },
    get invokeCount() {
      return requests.filter((r) => r.operation === "invoke").length;
    },
    get listenerCount() {
      return listeners.size;
    },
    emit(eventName, payload) {
      deliver({ type: "event", name: eventName, payload });
    },
    uninstall() {
      delete win[name];
      listeners.clear();
    },
  };
}
