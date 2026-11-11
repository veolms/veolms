import type { BridgeValue } from "../protocol/types.d.ts";

/**
 * Abstract base class for all bridge-related errors.
 */
export abstract class BridgeError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = "BRIDGE_ERROR") {
    super(message);
    // Default: the class name, so subclasses outside this library keep their own name. Library
    // classes then set a literal `name` (only when constructed as exactly that class), because
    // `constructor.name` is mangled by minifiers (e.g. "he" instead of "BridgeTimeoutError").
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when bridge initialization fails or is rejected.
 */
export class BridgeInitializationError extends BridgeError {
  constructor(message: string, code: string = "INIT_ERROR") {
    super(message, code);
    if (new.target === BridgeInitializationError)
      this.name = "BridgeInitializationError";
  }
}

/**
 * Error thrown when the underlying transport or native endpoint fails, disappears, or throws.
 */
export class BridgeTransportError extends BridgeError {
  constructor(message: string, code: string = "TRANSPORT_ERROR") {
    super(message, code);
    if (new.target === BridgeTransportError) this.name = "BridgeTransportError";
  }
}

/**
 * Error thrown when a pending request exceeds its configured timeout duration.
 */
export class BridgeTimeoutError extends BridgeError {
  public readonly requestId: string;

  constructor(requestId: string, timeoutMs: number) {
    super(
      `Bridge request "${requestId}" timed out after ${timeoutMs}ms`,
      "TIMEOUT_ERROR",
    );
    if (new.target === BridgeTimeoutError) this.name = "BridgeTimeoutError";
    this.requestId = requestId;
  }
}

/**
 * Error thrown when protocol validation or payload structure checks fail.
 */
export class BridgeProtocolError extends BridgeError {
  constructor(message: string, code: string = "PROTOCOL_ERROR") {
    super(message, code);
    if (new.target === BridgeProtocolError) this.name = "BridgeProtocolError";
  }
}

/**
 * Error thrown when a native platform operation returns an error status or exception.
 */
export class BridgeNativeError extends BridgeError {
  public readonly details?: BridgeValue;

  constructor(
    message: string,
    code: string = "NATIVE_ERROR",
    details?: BridgeValue,
  ) {
    super(message, code);
    if (new.target === BridgeNativeError) this.name = "BridgeNativeError";
    this.details = details;
  }
}

/**
 * Error thrown when a lower-level direct transport operation targets an unsupported path or member.
 */
export class BridgeUnsupportedError extends BridgeError {
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
    if (new.target === BridgeUnsupportedError)
      this.name = "BridgeUnsupportedError";
    this.path = path;
  }
}

/**
 * Error thrown when writing a property that native exposes as read-only.
 * Extends `BridgeUnsupportedError` so existing `instanceof` checks keep working.
 */
export class BridgeReadOnlyError extends BridgeUnsupportedError {
  constructor(path: string) {
    super(
      path,
      `Property "${path}" is read-only on native.`,
      "READ_ONLY_PROPERTY",
    );
    if (new.target === BridgeReadOnlyError) this.name = "BridgeReadOnlyError";
  }
}
