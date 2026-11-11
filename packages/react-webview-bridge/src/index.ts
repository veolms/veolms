/**
 * @veolms/react-webview-bridge — React bindings for the `@veolms/webview-bridge` native bridge client.
 * @packageDocumentation
 */
export {
  NativeBridgeProvider,
  NativeBridgeContext,
  useBridgeController,
} from "./provider.tsx";
export type { NativeBridgeProviderProps } from "./provider.tsx";

export { useNativeBridge, useBridgeCall, useBridgeEvent } from "./hooks.ts";
export type {
  UseNativeBridgeResult,
  UseBridgeCallResult,
  BridgeCallStatus,
  UseBridgeEventOptions,
} from "./hooks.ts";

export {
  getBridgeController,
  hasBridgeController,
  disposeNativeBridge,
  resetNativeBridges,
  getNativeBridgeDiagnostics,
  DEFAULT_READY_TIMEOUT_MS,
} from "./controller.ts";
export type { NativeBridgeDiagnostics } from "./controller.ts";

export { BridgeNotReadyError, isBridgeNotReadyError } from "./errors.ts";
export type { BridgeNotReadyReason } from "./errors.ts";

export { BridgeErrorBoundary } from "./error-boundary.tsx";
export type { BridgeErrorBoundaryProps } from "./error-boundary.tsx";

export {
  DEFAULT_RETRY_POLICY,
  computeRetryDelay,
  resolveRetryPolicy,
} from "./retry.ts";
export {
  DEFAULT_ENDPOINT_NAME,
  isNativeEndpointPresent,
  normalizeEndpointName,
} from "./presence.ts";

export type {
  BridgeState,
  BridgeTerminalState,
  BridgeSnapshot,
  BridgeInstance,
  NativeBridgeRoot,
  BridgeController,
  BridgeControllerConfig,
  NativeBridgeOptions,
  RetryPolicy,
  WaitOptions,
  ReadyBridge,
  Register,
  RegisteredContract,
  ContractOf,
} from "./types.ts";
