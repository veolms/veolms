import type { BridgeValue } from "../protocol/types.d.ts";

/**
 * Abstract base class for all bridge-related errors.
 */
export abstract class BridgeError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = "BRIDGE_ERROR") {
    super(message);
    // Fallback for subclasses outside this library. Library classes set a literal `name` below,
    // because `constructor.name` is mangled by minifiers (e.g. "he" instead of "BridgeTimeoutError").
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when bridge initialization fails or is rejected.
 */
export class BridgeInitializationError extends BridgeError {
  public override name = "BridgeInitializationError";
  constructor(message: string, code: string = "INIT_ERROR") {
    super(message, code);
  }
}

/**
 * Error thrown when the underlying transport or native endpoint fails, disappears, or throws.
 */
export class BridgeTransportError extends BridgeError {
  public override name = "BridgeTransportError";
  constructor(message: string, code: string = "TRANSPORT_ERROR") {
    super(message, code);
  }
}

/**
 * Error thrown when a pending request exceeds its configured timeout duration.
 */
export class BridgeTimeoutError extends BridgeError {
  public override name = "BridgeTimeoutError";
  public readonly requestId: string;

  constructor(requestId: string, timeoutMs: number) {
    super(
      `Bridge request "${requestId}" timed out after ${timeoutMs}ms`,
      "TIMEOUT_ERROR",
    );
    this.requestId = requestId;
  }
}

/**
 * Error thrown when protocol validation or payload structure checks fail.
 */
export class BridgeProtocolError extends BridgeError {
  public override name = "BridgeProtocolError";
  constructor(message: string, code: string = "PROTOCOL_ERROR") {
    super(message, code);
  }
}

/**
 * Error thrown when a native platform operation returns an error status or exception.
 */
export class BridgeNativeError extends BridgeError {
  public override name = "BridgeNativeError";
  public readonly details?: BridgeValue;

  constructor(
    message: string,
    code: string = "NATIVE_ERROR",
    details?: BridgeValue,
  ) {
    super(message, code);
    this.details = details;
  }
}

/**
 * Error thrown when a lower-level direct transport operation targets an unsupported path or member.
 */
export class BridgeUnsupportedError extends BridgeError {
  public override name = "BridgeUnsupportedError";
  public readonly path: string;

  constructor(
    path: string,
    message?: string,
    code: string = "UNSUPPORTED_ERROR",
  ) {
    super(
      message ??
        `Native capability "${path}" is unsupported on the current platform`,
      code,
    );
    this.path = path;
  }
}

/**
 * Error thrown when writing a property that native exposes as read-only.
 * Extends `BridgeUnsupportedError` so existing `instanceof` checks keep working.
 */
export class BridgeReadOnlyError extends BridgeUnsupportedError {
  public override name = "BridgeReadOnlyError";
  constructor(path: string) {
    super(
      path,
      `Property "${path}" is read-only on native.`,
      "READ_ONLY_PROPERTY",
    );
  }
}
