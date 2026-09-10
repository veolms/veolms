import { MESSAGE_TYPES, OPERATIONS, REPLY_STATUS } from "./constants.ts";
import type {
  BridgeEvent,
  BridgeMessage,
  BridgeReply,
  BridgeRequest,
  BridgeValue,
} from "./types.d.ts";

/**
 * @zod-candidate This manual structural type guard can be replaced with a Zod schema in zero-dependency-free environments.
 * Validates if an unknown value is a JSON-safe BridgeValue.
 * Disallows undefined, functions, symbols, BigInt, Date, Map, Set, class instances.
 */
export function isBridgeValue(val: unknown): val is BridgeValue {
  if (
    val === null ||
    typeof val === "boolean" ||
    typeof val === "number" ||
    typeof val === "string"
  ) {
    return true;
  }
  if (typeof val !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  if (Array.isArray(val)) {
    return val.every(isBridgeValue);
  }
  if (proto !== null && proto !== Object.prototype) {
    return false;
  }
  return Object.values(val as Record<string, unknown>).every(isBridgeValue);
}

/**
 * @zod-candidate Can be replaced with Zod schema validation.
 * Validates if an unknown value matches the BridgeReply interface.
 */
export function isBridgeReply(val: unknown): val is BridgeReply {
  if (val === null || typeof val !== "object") {
    return false;
  }
  const obj = val as Record<string, unknown>;
  const type = obj["type"];
  if (type !== MESSAGE_TYPES.REPLY && type !== MESSAGE_TYPES.ACK) {
    return false;
  }
  if (typeof obj["id"] !== "string" || obj["id"] === "") {
    return false;
  }
  const status = obj["status"];
  if (
    status !== REPLY_STATUS.SUCCESS &&
    status !== REPLY_STATUS.ACK &&
    status !== REPLY_STATUS.ERROR
  ) {
    return false;
  }
  const op = obj["operation"];
  if (
    op !== OPERATIONS.INIT &&
    op !== OPERATIONS.INVOKE &&
    op !== OPERATIONS.GET &&
    op !== OPERATIONS.SET
  ) {
    return false;
  }
  return true;
}

/**
 * @zod-candidate Can be replaced with Zod schema validation.
 * Validates if an unknown value matches the BridgeEvent interface.
 */
export function isBridgeEvent(val: unknown): val is BridgeEvent {
  if (val === null || typeof val !== "object") {
    return false;
  }
  const obj = val as Record<string, unknown>;
  if (obj["type"] !== MESSAGE_TYPES.EVENT) {
    return false;
  }
  if (typeof obj["name"] !== "string" || obj["name"] === "") {
    return false;
  }
  if (!("payload" in obj) || !isBridgeValue(obj["payload"])) {
    return false;
  }
  return true;
}

/**
 * @zod-candidate Can be replaced with Zod schema validation.
 * Validates if an unknown value matches any BridgeRequest structure.
 */
export function isBridgeRequest(val: unknown): val is BridgeRequest {
  if (val === null || typeof val !== "object") {
    return false;
  }
  const obj = val as Record<string, unknown>;
  if (obj["type"] !== MESSAGE_TYPES.REQUEST) {
    return false;
  }
  if (typeof obj["id"] !== "string" || obj["id"] === "") {
    return false;
  }
  const op = obj["operation"];
  if (
    op !== OPERATIONS.INIT &&
    op !== OPERATIONS.INVOKE &&
    op !== OPERATIONS.GET &&
    op !== OPERATIONS.SET
  ) {
    return false;
  }
  if (typeof obj["payload"] !== "object" || obj["payload"] === null) {
    return false;
  }
  return true;
}

/**
 * @zod-candidate Can be replaced with Zod discriminated union schema (z.discriminatedUnion('type', [...])).
 * Validates if an unknown value matches any BridgeMessage structure.
 */
export function isBridgeMessage(val: unknown): val is BridgeMessage {
  if (val === null || typeof val !== "object") {
    return false;
  }
  const obj = val as Record<string, unknown>;
  const type = obj["type"];
  if (type === MESSAGE_TYPES.REPLY || type === MESSAGE_TYPES.ACK) {
    return isBridgeReply(val);
  }
  if (type === MESSAGE_TYPES.EVENT) {
    return isBridgeEvent(val);
  }
  if (type === MESSAGE_TYPES.REQUEST) {
    return isBridgeRequest(val);
  }
  return false;
}

/**
 * Encodes a BridgeMessage object into a JSON string.
 */
export function encodeBridgeMessage(message: BridgeMessage): string {
  return JSON.stringify(message);
}

/**
 * Decodes a raw string message into a validated BridgeMessage object.
 * Returns `null` if the message is malformed or invalid JSON. Never throws.
 */
export function decodeBridgeMessage(rawMessage: string): BridgeMessage | null {
  if (typeof rawMessage !== "string" || rawMessage.trim() === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(rawMessage);
    if (isBridgeMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    // Malformed JSON is safely caught and ignored at protocol boundary
    return null;
  }
}
