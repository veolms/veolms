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
 * Converts an outbound argument/property value into a JSON-safe BridgeValue, following
 * `JSON.stringify` semantics where they are lossless and throwing where they would silently
 * corrupt data or throw a raw TypeError:
 *
 * - `undefined` becomes `null` in arrays and is omitted in objects (as JSON does);
 * - `Date` becomes its ISO-8601 string; other values with `toJSON()` use its result;
 * - class instances are sent as their own enumerable properties (as JSON does);
 * - `NaN`/`Infinity`, `BigInt`, functions, symbols, `Map`/`Set`/`WeakMap`/`WeakSet`,
 *   binary buffers, Promises and circular references throw an `Error` naming the location.
 *
 * Never mutates the input.
 */
export function normalizeBridgeValue(
  value: unknown,
  location: string = "value",
): BridgeValue {
  return normalizeValue(value, location, new Set<object>());
}

function normalizeValue(
  value: unknown,
  location: string,
  ancestors: Set<object>,
): BridgeValue {
  if (value === null || value === undefined) {
    return null;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(
          `${location} is ${String(value)}, which cannot be represented in JSON.`,
        );
      }
      return value;
    case "bigint":
      throw new Error(
        `${location} is a BigInt, which is not supported by the bridge protocol. Convert it to a string or number.`,
      );
    case "function":
    case "symbol":
      throw new Error(
        `${location} is a ${typeof value}, which cannot be sent to native.`,
      );
  }

  const obj = value as object;
  if (obj instanceof Date) {
    if (Number.isNaN(obj.getTime())) {
      throw new Error(`${location} is an invalid Date.`);
    }
    return obj.toISOString();
  }
  if (
    obj instanceof Map ||
    obj instanceof Set ||
    obj instanceof WeakMap ||
    obj instanceof WeakSet ||
    obj instanceof Promise ||
    obj instanceof ArrayBuffer ||
    ArrayBuffer.isView(obj)
  ) {
    throw new Error(
      `${location} is a ${obj.constructor?.name ?? "non-plain object"}, which would be sent as "{}". Convert it to an array or plain object.`,
    );
  }
  if (ancestors.has(obj)) {
    throw new Error(`${location} contains a circular reference.`);
  }

  const toJSON = (obj as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") {
    return normalizeValue(
      (toJSON as (key: string) => unknown).call(obj, ""),
      location,
      ancestors,
    );
  }

  ancestors.add(obj);
  try {
    if (Array.isArray(obj)) {
      return obj.map((item, index) =>
        normalizeValue(item, `${location}[${index}]`, ancestors),
      );
    }
    const result: { [key: string]: BridgeValue } = {};
    for (const key of Object.keys(obj)) {
      const item = (obj as Record<string, unknown>)[key];
      if (item === undefined) {
        continue; // JSON omits undefined properties
      }
      result[key] = normalizeValue(item, `${location}.${key}`, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(obj);
  }
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
