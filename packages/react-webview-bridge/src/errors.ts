import { BridgeError } from "@veolms/webview-bridge";
import type { BridgeState } from "./types.ts";

/** Why a call or wait could not be served by a ready bridge. */
export type BridgeNotReadyReason =
  /** `waitForReady: false` and the bridge was not ready. */
  | "not-ready"
  /** Readiness did not happen within `timeoutMs`. */
  | "timeout"
  /** Retries exhausted, endpoint absent. */
  | "unavailable"
  /** Retries exhausted, endpoint present but the handshake failed. */
  | "error"
  /** The controller was disposed/reset while waiting. */
  | "disposed"
  /** The caller's `AbortSignal` fired. */
  | "aborted";

/**
 * Rejection used by `call`/`whenReady`/`useBridgeCall` when the bridge is not (or no longer going
 * to be) ready. Extends the library's `BridgeError`, so `instanceof BridgeError` holds.
 */
export class BridgeNotReadyError extends BridgeError {
  public static readonly CODE = "BRIDGE_NOT_READY";
  public readonly endpointName: string;
  public readonly reason: BridgeNotReadyReason;
  /** Controller state at the time of the rejection. */
  public readonly state: BridgeState;
  /** The underlying init failure, when known. */
  public override readonly cause: Error | undefined;

  constructor(
    endpointName: string,
    reason: BridgeNotReadyReason,
    state: BridgeState,
    cause?: Error | null,
    message?: string,
  ) {
    super(
      message ??
        `Native bridge "${endpointName}" is not ready (${reason}; state: ${state})${
          cause ? `: ${cause.message}` : ""
        }`,
      BridgeNotReadyError.CODE,
    );
    // Explicit: `constructor.name` does not survive minification.
    this.name = "BridgeNotReadyError";
    this.endpointName = endpointName;
    this.reason = reason;
    this.state = state;
    this.cause = cause ?? undefined;
  }
}

/** Type guard for {@link BridgeNotReadyError} (works across bundles by checking `code`). */
export function isBridgeNotReadyError(
  error: unknown,
): error is BridgeNotReadyError {
  return (
    error instanceof BridgeNotReadyError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === BridgeNotReadyError.CODE)
  );
}
