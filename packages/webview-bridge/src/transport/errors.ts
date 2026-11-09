import type { BridgeValue } from "../protocol/types.d.ts";

/**
 * Abstract base class for all bridge-related errors.
 */
export abstract class BridgeError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = "BRIDGE_ERROR") {
    super(message);
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
  }
}

/**
 * Error thrown when the underlying transport or native endpoint fails, disappears, or throws.
 */
export class BridgeTransportError extends BridgeError {
  constructor(message: string, code: string = "TRANSPORT_ERROR") {
    super(message, code);
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
    this.requestId = requestId;
  }
}

/**
 * Error thrown when protocol validation or payload structure checks fail.
 */
export class BridgeProtocolError extends BridgeError {
  constructor(message: string, code: string = "PROTOCOL_ERROR") {
    super(message, code);
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
    this.details = details;
  }
}

/**
 * Error thrown when a lower-level direct transport operation targets an unsupported path or member.
 */
export class BridgeUnsupportedError extends BridgeError {
  public readonly path: string;

  constructor(path: string) {
    super(
      `Native capability "${path}" is unsupported on the current platform`,
      "UNSUPPORTED_ERROR",
    );
    this.path = path;
  }
}
