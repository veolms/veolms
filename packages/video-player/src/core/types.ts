export type MaybePromise<Value> = Value | Promise<Value>;

export type VideoSourceKind = "auto" | "dash" | "hls" | "file";

export type VideoRequestKind =
  | "manifest"
  | "segment"
  | "license"
  /** An HLS AES-128 key (`#EXT-X-KEY`, such as `key.bin`). */
  | "key"
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
  /** How many segments past the one being appended are fetched at once. */
  segmentPrefetchLimit?: number;
  abrEnabled?: boolean;
  /**
   * A quality the viewer chose, by picture height: playback (and a preload
   * of the source) starts at the highest variant not above it, or the
   * lowest one when every variant is taller, and stays there (ABR off)
   * until auto quality is enabled. Like `startTime` it only says where a
   * load starts: a source differing in it alone is not loaded again.
   */
  preferredVideoHeight?: number;
  abrRestrictions?: AbrRestrictions;
  /**
   * Bits per second assumed before the first segment is measured. Left out,
   * the Shaka engine starts from what it measured on the previous video.
   */
  abrDefaultBandwidthEstimate?: number;
  /** Seconds between ABR evaluations. */
  abrSwitchInterval?: number;
  abrBandwidthUpgradeTarget?: number;
  abrBandwidthDowngradeTarget?: number;
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
  /**
   * The text of the HLS master playlist at `src`, when the caller already
   * has it. The Shaka engine answers the request for `src` from it instead
   * of the network; relative URIs in it are resolved against `src`.
   */
  inlinedManifest?: string;
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
