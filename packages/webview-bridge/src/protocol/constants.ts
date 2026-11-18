/**
 * Current supported protocol version.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Client JavaScript library version.
 */
export const CLIENT_VERSION = "0.2.0";

/**
 * Default bridge registration name on window.
 */
export const DEFAULT_BRIDGE_NAME = "NativeBridge";

/**
 * Protocol path namespace separator.
 * Used for protocol-level paths (e.g. "systemBars:hideStatusBar").
 */
export const PATH_SEPARATOR = ":";

/**
 * Member names the root bridge proxy reserves for its own utilities (`bridge.toString()`,
 * `bridge.toJSON()`, `bridge.onEvent(name, handler)`, `bridge.dispose()`). A native root member
 * (or namespace) with one of these names is unreachable from JS. The Kotlin JSBridge compiler
 * rejects them; other natives (iOS, hand-written) must avoid them. Nested members may use them.
 */
export const RESERVED_ROOT_NAMES: ReadonlySet<string> = new Set([
  "toString",
  "toJSON",
  "onEvent",
  "dispose",
]);

/**
 * Protocol message types.
 */
export const MESSAGE_TYPES = {
  REQUEST: "request",
  REPLY: "reply",
  ACK: "ack",
  EVENT: "event",
} as const;

/**
 * Protocol operations.
 */
export const OPERATIONS = {
  INIT: "init",
  INVOKE: "invoke",
  GET: "get",
  SET: "set",
} as const;

/**
 * Protocol reply statuses.
 */
export const REPLY_STATUS = {
  SUCCESS: "success",
  ACK: "ack",
  ERROR: "error",
} as const;
