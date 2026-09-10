/**
 * Current supported protocol version.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Client JavaScript library version.
 */
export const CLIENT_VERSION = "0.1.1";

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
