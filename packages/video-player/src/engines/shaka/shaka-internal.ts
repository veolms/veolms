import type {
  ExternalTextTrack,
  VideoAudioTrack,
  VideoNetworkRequest,
  VideoNetworkResponse,
  VideoQuality,
  VideoRequestKind,
  VideoSource,
  VideoTextTrack,
} from "../../core/types";

export interface ShakaEventLike {
  detail?: unknown;
  buffering?: boolean;
  newStatus?: boolean;
}

export interface ShakaErrorLike {
  severity?: number;
  category?: number;
  code?: number | string;
  data?: readonly unknown[];
  message?: string;
}

export interface ShakaVariantTrackLike {
  id: number | string;
  active?: boolean;
  audioId?: number | string | null;
  language?: string;
  audioRoles?: readonly string[];
  channelsCount?: number | null;
  bandwidth?: number | null;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  hdr?: string | null;
}

export interface ShakaAudioTrackLike {
  id?: number | string;
  active?: boolean;
  label?: string | null;
  language?: string;
  roles?: readonly string[];
  channelsCount?: number | null;
  audioCodec?: string | null;
  codecs?: string | null;
  bandwidth?: number | null;
  spatialAudio?: boolean;
}

export interface ShakaTextTrackLike {
  id: number | string;
  active?: boolean;
  label?: string | null;
  language?: string;
  kind?: string | null;
  roles?: readonly string[];
  forced?: boolean;
}

export interface ShakaNetworkRequestLike {
  uris: string[];
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer | ArrayBufferView | null;
  allowCrossSiteCredentials?: boolean;
}

export interface ShakaNetworkResponseLike {
  uri: string;
  originalUri?: string;
  headers?: Record<string, string>;
  data: ArrayBuffer;
  status?: number;
}

export type ShakaRequestFilterLike = (
  type: number,
  request: ShakaNetworkRequestLike,
) => void | Promise<void>;

export type ShakaResponseFilterLike = (
  type: number,
  response: ShakaNetworkResponseLike,
) => void | Promise<void>;

export interface ShakaNetworkingEngineLike {
  registerRequestFilter(filter: ShakaRequestFilterLike): void;
  unregisterRequestFilter(filter: ShakaRequestFilterLike): void;
  registerResponseFilter(filter: ShakaResponseFilterLike): void;
  unregisterResponseFilter(filter: ShakaResponseFilterLike): void;
}

export interface ShakaPlayerLike {
  addEventListener(
    type: string,
    listener: (event: ShakaEventLike) => void,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: ShakaEventLike) => void,
  ): void;
  attach(media: HTMLMediaElement, initializeMediaSource?: boolean): Promise<void>;
  detach(): Promise<void>;
  load(uri: string, startTime?: number, mimeType?: string): Promise<unknown>;
  unload(initializeMediaSource?: boolean): Promise<void>;
  destroy(): Promise<void>;
  configure(configuration: unknown): boolean;
  resetConfiguration?(): void;
  getNetworkingEngine(): ShakaNetworkingEngineLike | null;
  getVariantTracks(): ShakaVariantTrackLike[];
  selectVariantTrack(
    track: ShakaVariantTrackLike,
    clearBuffer?: boolean,
    safeMargin?: number,
  ): void;
  getAudioTracks(): ShakaAudioTrackLike[];
  selectAudioTrack(track: ShakaAudioTrackLike, safeMargin?: number): void;
  getTextTracks(): ShakaTextTrackLike[];
  selectTextTrack(track: ShakaTextTrackLike | null): void;
  addTextTrackAsync?(
    uri: string,
    language: string,
    kind?: string,
    mimeType?: string,
    codec?: string,
    label?: string,
    forced?: boolean,
  ): Promise<unknown>;
}

export interface ShakaRuntimeLike {
  polyfill: { installAll(): void };
  Player: {
    new (): ShakaPlayerLike;
    isBrowserSupported(): boolean;
  };
  net?: {
    NetworkingEngine?: {
      RequestType?: Record<string, number>;
    };
  };
  util?: {
    Error?: {
      Category?: Record<string, number>;
      Severity?: Record<string, number>;
    };
  };
  drm?: {
    FairPlay?: {
      initDataTransform?(
        initData: Uint8Array,
        contentId: string,
        serverCertificate: Uint8Array,
      ): Uint8Array;
    };
  };
}

export type ShakaRuntimeLoader = () => Promise<unknown>;

export async function defaultShakaRuntimeLoader(): Promise<unknown> {
  return import("shaka-player");
}

export function resolveShakaRuntime(module: unknown): ShakaRuntimeLike {
  const record = module as { default?: unknown } | null;
  const candidate = (record?.default ?? module) as Partial<ShakaRuntimeLike> | null;

  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof candidate.Player !== "function" ||
    typeof candidate.polyfill?.installAll !== "function"
  ) {
    throw new TypeError("The loaded module is not a compatible Shaka runtime.");
  }

  return candidate as ShakaRuntimeLike;
}

export function normalizeShakaQuality(
  track: ShakaVariantTrackLike,
): VideoQuality {
  const heightLabel = track.height ? `${track.height}p` : "Audio only";
  const frameRateLabel =
    track.frameRate && track.frameRate > 30
      ? ` ${Math.round(track.frameRate)}fps`
      : "";

  return {
    id: `shaka-quality:${String(track.id)}`,
    label: `${heightLabel}${frameRateLabel}`,
    active: Boolean(track.active),
    bandwidth: track.bandwidth ?? undefined,
    width: track.width ?? undefined,
    height: track.height ?? undefined,
    frameRate: track.frameRate ?? undefined,
    videoCodec: track.videoCodec ?? undefined,
    audioCodec: track.audioCodec ?? undefined,
    hdr: track.hdr ?? undefined,
  };
}

export function normalizeShakaAudioTrack(
  track: ShakaAudioTrackLike,
  index = 0,
): VideoAudioTrack {
  const language = track.language || "und";
  const fingerprint = [
    track.id ?? index,
    language,
    track.label ?? "",
    ...(track.roles ?? []),
    track.codecs ?? track.audioCodec ?? "",
    track.channelsCount ?? "",
  ].join("|");
  return {
    id: `shaka-audio:${encodeURIComponent(fingerprint)}`,
    label: track.label || language || "Audio",
    language,
    active: Boolean(track.active),
    roles: [...(track.roles ?? [])],
    channelsCount: track.channelsCount ?? undefined,
    codec: track.codecs ?? track.audioCodec ?? undefined,
    bandwidth: track.bandwidth ?? undefined,
    spatialAudio: track.spatialAudio,
  };
}

export function normalizeShakaTextTrack(
  track: ShakaTextTrackLike,
): VideoTextTrack {
  const language = track.language || "und";
  return {
    id: `shaka-text:${String(track.id)}`,
    label: track.label || language || "Text",
    language,
    active: Boolean(track.active),
    kind: track.kind ?? undefined,
    roles: [...(track.roles ?? [])],
    forced: track.forced,
  };
}

export function mapRequestKind(
  type: number,
  requestTypes: Record<string, number> | undefined,
): VideoRequestKind {
  const entries: Array<[string, VideoRequestKind]> = [
    ["MANIFEST", "manifest"],
    ["SEGMENT", "segment"],
    ["LICENSE", "license"],
    ["TIMING", "manifest"],
    ["APP", "other"],
  ];

  for (const [shakaName, normalized] of entries) {
    if (requestTypes?.[shakaName] === type) {
      return normalized;
    }
  }
  return "other";
}

export function toVideoNetworkRequest(
  type: VideoRequestKind,
  request: ShakaNetworkRequestLike,
): VideoNetworkRequest {
  return {
    type,
    uris: [...request.uris],
    method: request.method,
    headers: { ...request.headers },
    body: request.body ?? null,
    allowCrossSiteCredentials: Boolean(request.allowCrossSiteCredentials),
  };
}

export function applyVideoNetworkRequest(
  normalized: VideoNetworkRequest,
  request: ShakaNetworkRequestLike,
): void {
  request.uris = [...normalized.uris];
  request.method = normalized.method;
  request.headers = { ...normalized.headers };
  request.body = normalized.body;
  request.allowCrossSiteCredentials = normalized.allowCrossSiteCredentials;
}

export function toVideoNetworkResponse(
  type: VideoRequestKind,
  response: ShakaNetworkResponseLike,
): VideoNetworkResponse {
  return {
    type,
    uri: response.uri,
    originalUri: response.originalUri,
    headers: { ...(response.headers ?? {}) },
    data: response.data,
    status: response.status,
  };
}

export function applyVideoNetworkResponse(
  normalized: VideoNetworkResponse,
  response: ShakaNetworkResponseLike,
): void {
  response.uri = normalized.uri;
  response.originalUri = normalized.originalUri;
  response.headers = { ...normalized.headers };
  response.data = normalized.data;
  response.status = normalized.status;
}

function retryConfiguration(
  retry: import("../../core/types").RetryParameters | undefined,
): Record<string, number> | undefined {
  if (!retry) {
    return undefined;
  }

  const mapped: Record<string, number> = {};
  if (retry.maxAttempts !== undefined) mapped.maxAttempts = retry.maxAttempts;
  if (retry.baseDelayMs !== undefined) mapped.baseDelay = retry.baseDelayMs;
  if (retry.backoffFactor !== undefined) mapped.backoffFactor = retry.backoffFactor;
  if (retry.fuzzFactor !== undefined) mapped.fuzzFactor = retry.fuzzFactor;
  if (retry.timeoutMs !== undefined) mapped.timeout = retry.timeoutMs;
  if (retry.stallTimeoutMs !== undefined) mapped.stallTimeout = retry.stallTimeoutMs;
  if (retry.connectionTimeoutMs !== undefined) {
    mapped.connectionTimeout = retry.connectionTimeoutMs;
  }
  return mapped;
}

function robustnessConfiguration(
  config: import("../../core/types").DrmSystemConfiguration,
): Record<string, unknown> {
  return {
    ...(config.headers ? { headers: { ...config.headers } } : {}),
    ...(config.audioRobustness
      ? { audioRobustness: [...config.audioRobustness] }
      : {}),
    ...(config.videoRobustness
      ? { videoRobustness: [...config.videoRobustness] }
      : {}),
  };
}

function bytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function decodeFairPlaySkdUri(data: Uint8Array): string {
  const pairs = Math.floor(data.byteLength / 2);
  let zeroHighBytes = 0;
  for (let index = 1; index < data.byteLength; index += 2) {
    if (data[index] === 0) zeroHighBytes += 1;
  }
  const encoding =
    pairs > 0 && zeroHighBytes / pairs > 0.4 ? "utf-16le" : "utf-8";
  return new TextDecoder(encoding).decode(data).replace(/\0+$/u, "").trim();
}

export function createShakaConfiguration(
  source: VideoSource,
  runtime: ShakaRuntimeLike,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const streaming = source.streaming;
  const networking = source.networking;

  if (streaming || networking?.segmentRetry) {
    result.streaming = {
      ...(streaming?.bufferingGoal !== undefined
        ? { bufferingGoal: streaming.bufferingGoal }
        : {}),
      ...(streaming?.rebufferingGoal !== undefined
        ? { rebufferingGoal: streaming.rebufferingGoal }
        : {}),
      ...(streaming?.bufferBehind !== undefined
        ? { bufferBehind: streaming.bufferBehind }
        : {}),
      ...(streaming?.lowLatencyMode !== undefined
        ? { lowLatencyMode: streaming.lowLatencyMode }
        : {}),
      ...(streaming?.preferNativeHls !== undefined
        ? { preferNativeHls: streaming.preferNativeHls }
        : {}),
      ...(streaming?.useNativeHlsForFairPlay !== undefined
        ? { useNativeHlsForFairPlay: streaming.useNativeHlsForFairPlay }
        : {}),
      ...(networking?.segmentRetry
        ? { retryParameters: retryConfiguration(networking.segmentRetry) }
        : {}),
    };
  }

  if (streaming?.abrEnabled !== undefined || streaming?.abrRestrictions) {
    result.abr = {
      ...(streaming.abrEnabled !== undefined
        ? { enabled: streaming.abrEnabled }
        : {}),
      ...(streaming.abrRestrictions
        ? { restrictions: { ...streaming.abrRestrictions } }
        : {}),
    };
  }

  if (networking?.manifestRetry) {
    result.manifest = {
      retryParameters: retryConfiguration(networking.manifestRetry),
    };
  }

  if (streaming?.transmuxWorkerUrl) {
    result.mediaSource = {
      transmuxWorkerUrl: streaming.transmuxWorkerUrl,
    };
  }

  const drm = source.drm;
  if (drm) {
    const servers: Record<string, string> = {};
    const advanced: Record<string, Record<string, unknown>> = {};

    if (drm.widevine) {
      servers["com.widevine.alpha"] = drm.widevine.licenseUrl;
      advanced["com.widevine.alpha"] = robustnessConfiguration(drm.widevine);
    }
    if (drm.playready) {
      servers["com.microsoft.playready"] = drm.playready.licenseUrl;
      advanced["com.microsoft.playready"] = robustnessConfiguration(drm.playready);
    }
    if (drm.fairplay) {
      const fairPlayAdvanced = {
        ...robustnessConfiguration(drm.fairplay),
        ...(drm.fairplay.certificateUrl
          ? { serverCertificateUri: drm.fairplay.certificateUrl }
          : {}),
        ...(drm.fairplay.certificate
          ? { serverCertificate: drm.fairplay.certificate }
          : {}),
      };
      servers["com.apple.fps"] = drm.fairplay.licenseUrl;
      servers["com.apple.fps.1_0"] = drm.fairplay.licenseUrl;
      advanced["com.apple.fps"] = fairPlayAdvanced;
      advanced["com.apple.fps.1_0"] = fairPlayAdvanced;
    }

    const drmConfiguration: Record<string, unknown> = {
      servers,
      advanced,
      ...(drm.clearKeys ? { clearKeys: { ...drm.clearKeys } } : {}),
    };

    if (drm.preferredSystems) {
      const keySystems = drm.preferredSystems.flatMap((system) => {
        if (system === "widevine") return ["com.widevine.alpha"];
        if (system === "playready") return ["com.microsoft.playready"];
        return ["com.apple.fps", "com.apple.fps.1_0"];
      });
      drmConfiguration.preferredKeySystems = keySystems;
    }

    if (networking?.licenseRetry) {
      drmConfiguration.retryParameters = retryConfiguration(
        networking.licenseRetry,
      );
    }

    const fairPlay = drm.fairplay;
    if (fairPlay?.transformInitData || fairPlay?.getContentId) {
      drmConfiguration.initDataTransform = (
        initData: ArrayBuffer | ArrayBufferView,
        initDataType: string,
        drmInfo?: { serverCertificate?: Uint8Array },
      ): Uint8Array => {
        const data = bytes(initData);
        const certificate =
          drmInfo?.serverCertificate ?? fairPlay.certificate;

        if (fairPlay.transformInitData) {
          return fairPlay.transformInitData(data, initDataType, certificate);
        }

        if (initDataType.toLowerCase() !== "skd") {
          return data;
        }

        const transform = runtime.drm?.FairPlay?.initDataTransform;
        if (!transform || !certificate || !fairPlay.getContentId) {
          return data;
        }

        const skdUri = decodeFairPlaySkdUri(data);
        return transform(data, fairPlay.getContentId(skdUri), certificate);
      };
    }

    result.drm = drmConfiguration;
  }

  return result;
}

export async function addExternalTextTrack(
  player: ShakaPlayerLike,
  track: ExternalTextTrack,
): Promise<void> {
  if (!player.addTextTrackAsync) {
    throw new Error("This Shaka runtime cannot add external text tracks.");
  }

  await player.addTextTrackAsync(
    track.src,
    track.language,
    track.kind ?? "subtitles",
    track.mimeType,
    track.codec,
    track.label,
    track.forced,
  );
}
