import type { VideoLoadOptions, VideoSource } from "../core/types";

type ComparableObject = Record<PropertyKey, unknown>;

function compareBytes(
  left: ArrayBuffer | ArrayBufferView,
  right: ArrayBuffer | ArrayBufferView,
): boolean {
  const leftBytes = ArrayBuffer.isView(left)
    ? new Uint8Array(left.buffer, left.byteOffset, left.byteLength)
    : new Uint8Array(left);
  const rightBytes = ArrayBuffer.isView(right)
    ? new Uint8Array(right.buffer, right.byteOffset, right.byteLength)
    : new Uint8Array(right);

  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

function areLoadValuesEqual(
  left: unknown,
  right: unknown,
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  if (
    (left instanceof ArrayBuffer || ArrayBuffer.isView(left)) &&
    (right instanceof ArrayBuffer || ArrayBuffer.isView(right))
  ) {
    return compareBytes(left, right);
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) =>
        areLoadValuesEqual(value, right[index], seen),
      )
    );
  }

  const leftPrototype = Object.getPrototypeOf(left);
  const rightPrototype = Object.getPrototypeOf(right);
  if (leftPrototype !== rightPrototype) return false;
  if (leftPrototype !== Object.prototype && leftPrototype !== null) {
    return false;
  }

  const comparedRightValues = seen.get(left);
  if (comparedRightValues?.has(right)) return true;
  const rightValues = comparedRightValues ?? new WeakSet<object>();
  rightValues.add(right);
  seen.set(left, rightValues);

  const leftRecord = left as ComparableObject;
  const rightRecord = right as ComparableObject;
  const leftKeys = Reflect.ownKeys(leftRecord);
  const rightKeys = Reflect.ownKeys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      areLoadValuesEqual(leftRecord[key], rightRecord[key], seen),
  );
}

function areLoadObjectsEqual(left: unknown, right: unknown): boolean {
  return areLoadValuesEqual(left, right, new WeakMap());
}

/**
 * Compares every source field that an engine or custom engine may use while
 * loading. This lets React callers recreate equivalent object literals without
 * interrupting playback, while preserving reloads for real configuration
 * changes (including nested DRM, networking, track, and metadata values).
 */
export function areVideoSourcesLoadEquivalent(
  left: VideoSource,
  right: VideoSource,
): boolean {
  return areLoadObjectsEqual(left, right);
}

export function areVideoLoadOptionsEquivalent(
  left: VideoLoadOptions | undefined,
  right: VideoLoadOptions | undefined,
): boolean {
  return areLoadObjectsEqual(left, right);
}
