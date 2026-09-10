/**
 * JSON-primitive value types allowed in bridge messages.
 */
export type BridgePrimitive = string | number | boolean | null;

/**
 * Recursive JSON-safe value type for bridge messages.
 * Functions, symbols, undefined, BigInt, Date, Map, Set, and class instances are disallowed.
 */
export type BridgeValue =
  BridgePrimitive | BridgeValue[] | { [key: string]: BridgeValue };

/**
 * Structured error details transmitted from native in a BridgeReply.
 */
export interface BridgeErrorPayload {
  code: string;
  message: string;
  details?: BridgeValue;
}

/**
 * Capability description payload returned from native during initialization.
 */
export interface BridgeCapabilityPayload {
  /** Protocol path using colon separator (e.g. "systemBars:hideStatusBar") */
  path: string;
  /** Kind of member */
  kind: "function" | "property" | "namespace";
  /** Whether property supports get operation */
  readable?: boolean;
  /** Whether property supports set operation */
  writable?: boolean;
}

/**
 * Metadata payload returned from native during initialization.
 */
export interface BridgeMetadataPayload {
  protocolVersion: number;
  bridgeVersion: string;
  sessionId: string;
  capabilities: BridgeCapabilityPayload[];
}

/**
 * Initialization request payload.
 */
export interface BridgeInitPayload {
  bridgeName: string;
  clientVersion: string;
  sessionId?: string;
}

/**
 * Method invocation request payload.
 */
export interface BridgeInvokePayload {
  path: string;
  args: BridgeValue[];
  sessionId?: string;
}

/**
 * Property get request payload.
 */
export interface BridgeGetPayload {
  path: string;
  sessionId?: string;
}

/**
 * Property set request payload.
 */
export interface BridgeSetPayload {
  path: string;
  value: BridgeValue;
  sessionId?: string;
}

/**
 * Initialization request sent to native to establish session and retrieve capability metadata.
 */
export interface BridgeInitRequest {
  type: "request";
  operation: "init";
  id: string;
  protocolVersion: number;
  payload: BridgeInitPayload;
}

/**
 * Method invocation request.
 */
export interface BridgeInvokeRequest {
  type: "request";
  operation: "invoke";
  id: string;
  payload: BridgeInvokePayload;
}

/**
 * Property get request.
 */
export interface BridgeGetRequest {
  type: "request";
  operation: "get";
  id: string;
  payload: BridgeGetPayload;
}

/**
 * Property set request.
 */
export interface BridgeSetRequest {
  type: "request";
  operation: "set";
  id: string;
  payload: BridgeSetPayload;
}

/**
 * Union of all outbound request messages from JS to Native.
 */
export type BridgeRequest =
  BridgeInitRequest | BridgeInvokeRequest | BridgeGetRequest | BridgeSetRequest;

/**
 * Uniform response message sent from Native to JS correlated by request `id`.
 * Contains `status: "ack"` or `type: "ack"` for void methods without a return payload.
 * Contains `status: "success"` and `result` payload when returning a value or null.
 * Contains `status: "error"` and `error` payload on failure.
 */
export interface BridgeReply {
  type: "reply" | "ack";
  operation: "init" | "invoke" | "get" | "set";
  id: string;
  status: "success" | "ack" | "error";
  result?: BridgeValue;
  error?: BridgeErrorPayload;
}

/**
 * Unsolicited event message sent from Native to JS.
 */
export interface BridgeEvent {
  type: "event";
  name: string;
  payload: BridgeValue;
}

/**
 * Complete discriminated union of protocol messages.
 */
export type BridgeMessage = BridgeRequest | BridgeReply | BridgeEvent;
