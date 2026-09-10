export {
  buildNativeBridge,
  clearNativeBridgeCache,
} from "./bridge/build-native-bridge.ts";
export type { BuildBridgeOptions } from "./bridge/build-native-bridge.ts";

// Structured Errors
export {
  BridgeError,
  BridgeInitializationError,
  BridgeTransportError,
  BridgeTimeoutError,
  BridgeProtocolError,
  BridgeNativeError,
  BridgeUnsupportedError,
} from "./transport/errors.ts";

// Protocol & Bridge Type Exports
export type {
  BridgePrimitive,
  BridgeValue,
  BridgeRequest,
  BridgeReply,
  BridgeEvent,
  BridgeMessage,
  BridgeCapabilityPayload,
  BridgeMetadataPayload,
} from "./protocol/types.d.ts";

export type { BridgeCapability, BridgeMetadata } from "./bridge/types.d.ts";
export type {
  NativeEndpoint,
  NativeMessageHandler,
  EndpointPlatform,
} from "./endpoint/types.d.ts";
export type {
  NativeTransport,
  BridgeEventHandler,
} from "./transport/types.d.ts";
