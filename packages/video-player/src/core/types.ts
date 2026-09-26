export type MaybePromise<Value> = Value | Promise<Value>;

export type VideoSourceKind = "auto" | "dash" | "hls" | "file";

export type VideoRequestKind =
  | "manifest"
  | "segment"
  | "license"
  | "text"
  | "thumbnail"
  | "other";

export type VideoEngineName = "native" | "shaka" | (string & {});

export type EngineLifecycleState =
  | "idle"
  | "attached"
  | "loading"
  | "ready"
  | "unloading"
  | "error"
  | "destroyed";

export type VideoEngineErrorCategory =
  | "NETWORK"
  | "TEXT"
  | "MEDIA"
  | "MANIFEST"
  | "STREAMING"
  | "DRM"
  | "PLAYER"
  | "UNSUPPORTED"
  | "SOURCE"
  | "ABORTED"
  | "UNKNOWN";

export interface TimeRange {
  start: number;
  end: number;
}

export interface VideoMetadata {
  title?: string;
  poster?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface VideoQuality {
  id: string;
  label: string;
  active: boolean;
  bandwidth?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  hdr?: string;
}

export interface VideoAudioTrack {
  id: string;
  label: string;
  language: string;
  active: boolean;
  roles: readonly string[];
  channelsCount?: number;
  codec?: string;
  bandwidth?: number;
  spatialAudio?: boolean;
}

export interface VideoTextTrack {
  id: string;
  label: string;
  language: string;
  active: boolean;
  kind?: string;
  roles: readonly string[];
  forced?: boolean;
}

export interface ExternalTextTrack {
  src: string;
  language: string;
  label?: string;
  kind?: "subtitles" | "captions";
  mimeType?: string;
  codec?: string;
  forced?: boolean;
}

export interface VideoNetworkRequest {
  type: VideoRequestKind;
  uris: string[];
  method: string;
  headers: Record<string, string>;
  body: ArrayBuffer | ArrayBufferView | null;
  allowCrossSiteCredentials: boolean;
}

export interface VideoNetworkResponse {
  type: VideoRequestKind;
  uri: string;
  originalUri?: string;
  headers: Record<string, string>;
  data: ArrayBuffer;
  status?: number;
}

export type VideoRequestFilter = (
  request: VideoNetworkRequest,
) => MaybePromise<void>;

export type VideoResponseFilter = (
  response: VideoNetworkResponse,
) => MaybePromise<void>;

export interface RetryParameters {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  fuzzFactor?: number;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export interface VideoNetworkingConfiguration {
  requestFilter?: VideoRequestFilter;
  responseFilter?: VideoResponseFilter;
  manifestRetry?: RetryParameters;
  segmentRetry?: RetryParameters;
  licenseRetry?: RetryParameters;
}

export interface DrmSystemConfiguration {
  licenseUrl: string;
  headers?: Record<string, string>;
  audioRobustness?: readonly string[];
  videoRobustness?: readonly string[];
}

export interface FairPlayDrmConfiguration extends DrmSystemConfiguration {
  certificateUrl?: string;
  certificate?: Uint8Array;
  getContentId?: (skdUri: string) => string;
  transformInitData?: (
    initData: Uint8Array,
    initDataType: string,
    serverCertificate?: Uint8Array,
  ) => Uint8Array;
}

export interface DrmConfiguration {
  widevine?: DrmSystemConfiguration;
  playready?: DrmSystemConfiguration;
  fairplay?: FairPlayDrmConfiguration;
  preferredSystems?: readonly ("widevine" | "playready" | "fairplay")[];
  clearKeys?: Record<string, string>;
}

export interface AbrRestrictions {
  minBandwidth?: number;
  maxBandwidth?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  minFrameRate?: number;
  maxFrameRate?: number;
}

export interface VideoStreamingConfiguration {
  bufferingGoal?: number;
  rebufferingGoal?: number;
  bufferBehind?: number;
  lowLatencyMode?: boolean;
  preferNativeHls?: boolean;
  useNativeHlsForFairPlay?: boolean;
  abrEnabled?: boolean;
  abrRestrictions?: AbrRestrictions;
  transmuxWorkerUrl?: string;
}

export interface VideoSource {
  id?: string;
  src: string;
  type?: string;
  kind?: VideoSourceKind;
  startTime?: number;
  metadata?: VideoMetadata;
  drm?: DrmConfiguration;
  networking?: VideoNetworkingConfiguration;
  streaming?: VideoStreamingConfiguration;
  textTracks?: readonly ExternalTextTrack[];
}

export interface VideoLoadOptions {
  startTime?: number;
  mimeType?: string;
}

export interface VideoEngineCapabilities {
  browserSupported: boolean;
  adaptiveStreaming: boolean;
  drm: boolean;
  nativeHls: boolean;
  pictureInPicture: boolean;
}
