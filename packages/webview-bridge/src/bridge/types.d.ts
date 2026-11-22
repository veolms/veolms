import type {
  BridgeCapabilityPayload,
  BridgeMetadataPayload,
} from "../protocol/types.d.ts";

/**
 * Parsed capability record in the runtime bridge.
 */
export interface BridgeCapability {
  path: string;
  kind: "function" | "property" | "namespace";
  readable: boolean;
  writable: boolean;
}

/**
 * Runtime metadata describing active native bridge session and capabilities.
 */
export interface BridgeMetadata {
  protocolVersion: number;
  bridgeVersion: string;
  sessionId: string;
  capabilities: BridgeCapability[];
}

export type { BridgeCapabilityPayload, BridgeMetadataPayload };
