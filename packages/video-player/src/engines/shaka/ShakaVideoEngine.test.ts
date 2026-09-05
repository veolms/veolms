import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ShakaNetworkRequestLike,
  ShakaRequestFilterLike,
  ShakaResponseFilterLike,
} from "./shaka-internal";
import { SHAKA_SEGMENT_PREFETCH_LIMIT } from "./shaka-internal";
import {
  setEarlyShakaPreloadSessionForTests,
} from "./shaka-early-preload";
import { ShakaVideoEngine } from "./ShakaVideoEngine";

class FakeMediaElement extends EventTarget {
  currentTime = 0;
  duration = 180;
  volume = 1;
  muted = false;
  playbackRate = 1;
  paused = true;
  ended = false;
  readyState = 1;
  error: MediaError | null = null;
  buffered = emptyRanges();
  seekable = emptyRanges();
  textTracks: TextTrack[] = [];
  canPlayType = vi.fn(() => "");
  async play(): Promise<void> {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }
  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

class FakeNetworkingEngine {
  requestFilters: ShakaRequestFilterLike[] = [];
  responseFilters: ShakaResponseFilterLike[] = [];
  registerRequestFilter = vi.fn((filter: ShakaRequestFilterLike) => {
    this.requestFilters.push(filter);
  });
  unregisterRequestFilter = vi.fn((filter: ShakaRequestFilterLike) => {
    this.requestFilters = this.requestFilters.filter((item) => item !== filter);
  });
  registerResponseFilter = vi.fn((filter: ShakaResponseFilterLike) => {
    this.responseFilters.push(filter);
  });
  unregisterResponseFilter = vi.fn((filter: ShakaResponseFilterLike) => {
    this.responseFilters = this.responseFilters.filter((item) => item !== filter);
  });
}

class FakePreloadManager {
  readonly destroy = vi.fn(async () => undefined);
}

class FakeShakaPlayer {
  readonly networking = new FakeNetworkingEngine();
  readonly listeners = new Map<string, Set<(event: object) => void>>();
  readonly configurations: unknown[] = [];
  readonly attach = vi.fn(async () => undefined);
  readonly detach = vi.fn(async () => undefined);
  readonly unload = vi.fn(async () => undefined);
  readonly destroy = vi.fn(async () => undefined);
  readonly resetConfiguration = vi.fn();
  readonly load = vi.fn(async () => undefined as unknown);
  readonly preload = vi.fn(async () => null as FakePreloadManager | null);
  readonly addTextTrackAsync = vi.fn(async () => undefined as unknown);
  variants = [
    {
      id: 1,
      active: true,
      height: 1080,
      width: 1920,
      bandwidth: 5_000_000,
      frameRate: 30,
      videoCodec: "avc1",
      audioId: 10,
      language: "en",
      audioRoles: [],
    },
    {
      id: 2,
      active: false,
      height: 720,
      width: 1280,
      bandwidth: 2_000_000,
      frameRate: 30,
      videoCodec: "avc1",
      audioId: 10,
      language: "en",
      audioRoles: [],
    },
    {
      id: 3,
      active: false,
      height: 1080,
      width: 1920,
      bandwidth: 5_100_000,
      frameRate: 30,
      videoCodec: "avc1",
      audioId: 11,
      language: "hi",
      audioRoles: [],
    },
    {
      id: 4,
      active: false,
      height: 720,
      width: 1280,
      bandwidth: 2_100_000,
      frameRate: 30,
      videoCodec: "avc1",
      audioId: 11,
      language: "hi",
      audioRoles: [],
    },
  ];
  audios = [
    { id: 10, active: true, label: "English", language: "en", roles: [] },
    { id: 11, active: false, label: "Hindi", language: "hi", roles: [] },
  ];
  texts = [
    {
      id: 20,
      active: false,
      label: "English",
      language: "en",
      kind: "subtitles",
      roles: [],
    },
  ];

  addEventListener(type: string, listener: (event: object) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: object) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: object = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  configure(configuration: unknown): boolean {
    this.configurations.push(configuration);
    return true;
  }

  getNetworkingEngine(): FakeNetworkingEngine {
    return this.networking;
  }

  getVariantTracks(): typeof this.variants {
    return this.variants;
  }

  selectVariantTrack(track: (typeof this.variants)[number]): void {
    for (const candidate of this.variants) candidate.active = candidate === track;
  }

  getAudioTracks(): typeof this.audios {
    return this.audios;
  }

  selectAudioTrack(track: (typeof this.audios)[number]): void {
    for (const candidate of this.audios) candidate.active = candidate === track;
  }

  getTextTracks(): typeof this.texts {
    return this.texts;
  }

  selectTextTrack(track: (typeof this.texts)[number] | null): void {
    for (const candidate of this.texts) candidate.active = candidate === track;
  }
}

function emptyRanges(): TimeRanges {
  return {
    length: 0,
    start: () => {
      throw new DOMException("Index out of bounds", "IndexSizeError");
    },
    end: () => {
      throw new DOMException("Index out of bounds", "IndexSizeError");
    },
  };
}

function asMediaElement(media: FakeMediaElement): HTMLMediaElement {
  return media as unknown as HTMLMediaElement;
}

function runtimeFor(player: FakeShakaPlayer): object {
  const Player = Object.assign(
    vi.fn(function FakePlayer() {
      return player;
    }),
    { isBrowserSupported: () => true },
  );

  return {
    default: {
      polyfill: { installAll: vi.fn() },
      Player,
      net: {
        NetworkingEngine: {
          RequestType: { MANIFEST: 0, SEGMENT: 1, LICENSE: 2 },
        },
      },
      util: {
        Error: {
          Category: { NETWORK: 1, TEXT: 2, MEDIA: 3, MANIFEST: 4, DRM: 6 },
          Severity: { RECOVERABLE: 1, CRITICAL: 2 },
        },
      },
    },
  };
}

describe("ShakaVideoEngine", () => {
  afterEach(() => {
    setEarlyShakaPreloadSessionForTests(null);
  });
  it("loads Shaka lazily and normalizes tracks", async () => {
    const player = new FakeShakaPlayer();
    const runtimeLoader = vi.fn(async () => runtimeFor(player));
    const engine = new ShakaVideoEngine({ runtimeLoader });
    const media = new FakeMediaElement();

    expect(runtimeLoader).not.toHaveBeenCalled();
    await engine.attach(asMediaElement(media));
    expect(runtimeLoader).toHaveBeenCalledOnce();
    expect(player.attach).toHaveBeenCalledWith(asMediaElement(media));

    await engine.load({
      src: "lesson.mpd",
      type: "application/dash+xml",
      startTime: 12,
      textTracks: [
        {
          src: "captions.vtt",
          language: "en",
          label: "English",
          mimeType: "text/vtt",
        },
      ],
    });

    expect(player.load).toHaveBeenCalledWith(
      "lesson.mpd",
      12,
      "application/dash+xml",
    );
    expect(player.addTextTrackAsync).toHaveBeenCalledWith(
      "captions.vtt",
      "en",
      "subtitles",
      "text/vtt",
      undefined,
      "English",
      undefined,
    );
    expect(engine.getQualities()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "shaka-quality:1", label: "1080p" }),
        expect.objectContaining({ id: "shaka-quality:2", label: "720p" }),
      ]),
    );
    expect(engine.getAudioTracks()[0]).toMatchObject({
      id: expect.stringContaining("shaka-audio:"),
      label: "English",
      active: true,
    });
  });

  it("maps explicit HLS and DASH source kinds to manifest MIME types", async () => {
    const player = new FakeShakaPlayer();
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));

    await engine.load({ src: "lesson.m3u8", kind: "hls" });
    expect(player.load).toHaveBeenLastCalledWith(
      "lesson.m3u8",
      undefined,
      "application/x-mpegurl",
    );

    await engine.load({ src: "lesson.mpd", kind: "dash" });
    expect(player.load).toHaveBeenLastCalledWith(
      "lesson.mpd",
      undefined,
      "application/dash+xml",
    );

    await engine.load(
      { src: "custom.m3u8", kind: "hls", type: "custom/source-type" },
      { mimeType: "custom/load-type" },
    );
    expect(player.load).toHaveBeenLastCalledWith(
      "custom.m3u8",
      undefined,
      "custom/load-type",
    );
  });

  it("maps ABR and track selection without exposing Shaka tracks", async () => {
    const player = new FakeShakaPlayer();
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));
    await engine.load({ src: "lesson.m3u8" });

    engine.selectQuality("shaka-quality:2");
    expect(player.variants.find((track) => track.active)).toMatchObject({
      id: 2,
      language: "en",
    });
    expect(engine.getSnapshot()).toMatchObject({
      autoQuality: false,
      selectedQualityId: "shaka-quality:2",
    });
    expect(player.configurations).toContainEqual({ abr: { enabled: false } });

    engine.enableAutoQuality();
    expect(engine.getSnapshot().autoQuality).toBe(true);
    expect(player.configurations).toContainEqual({ abr: { enabled: true } });

    const hindiTrack = engine
      .getAudioTracks()
      .find((track) => track.language === "hi");
    expect(hindiTrack).toBeDefined();
    engine.selectAudioTrack(hindiTrack?.id ?? "");
    engine.selectTextTrack("shaka-text:20");
    expect(engine.getSnapshot()).toMatchObject({
      selectedAudioTrackId: hindiTrack?.id,
      selectedTextTrackId: "shaka-text:20",
    });
    engine.selectTextTrack(null);
    expect(engine.getSnapshot().selectedTextTrackId).toBeNull();
  });

  it("maps DRM, retry configuration, and mutable networking hooks", async () => {
    const player = new FakeShakaPlayer();
    const requestFilter = vi.fn((request: { headers: Record<string, string> }) => {
      request.headers.Authorization = "Bearer refreshed";
    });
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));
    await engine.load({
      src: "protected.mpd",
      drm: {
        widevine: {
          licenseUrl: "https://license.example/widevine",
          headers: { "X-DRM": "widevine" },
          videoRobustness: ["SW_SECURE_DECODE"],
        },
      },
      networking: {
        requestFilter,
        segmentRetry: { maxAttempts: 4, baseDelayMs: 250 },
        licenseRetry: { maxAttempts: 2 },
      },
      streaming: { bufferingGoal: 20, abrEnabled: true },
    });

    expect(player.configurations[0]).toMatchObject({
      streaming: {
        bufferingGoal: 20,
        segmentPrefetchLimit: SHAKA_SEGMENT_PREFETCH_LIMIT,
        retryParameters: { maxAttempts: 4, baseDelay: 250 },
      },
      abr: { enabled: true },
      drm: {
        servers: {
          "com.widevine.alpha": "https://license.example/widevine",
        },
        advanced: {
          "com.widevine.alpha": {
            headers: { "X-DRM": "widevine" },
          },
        },
        retryParameters: { maxAttempts: 2 },
      },
    });

    const request: ShakaNetworkRequestLike = {
      uris: ["https://license.example/widevine"],
      method: "POST",
      headers: {},
    };
    await player.networking.requestFilters[0]?.(2, request);
    expect(request.headers).toEqual({ Authorization: "Bearer refreshed" });
    expect(requestFilter).toHaveBeenCalledWith(
      expect.objectContaining({ type: "license" }),
    );

    await engine.unload();
    expect(player.networking.unregisterRequestFilter).toHaveBeenCalledOnce();
  });

  it("only applies the built-in FairPlay transform to skd init data", async () => {
    const player = new FakeShakaPlayer();
    const transform = vi.fn(
      (
        data: Uint8Array,
        _contentId: string,
        _certificate: Uint8Array,
      ) => data,
    );
    const runtime = runtimeFor(player) as {
      default: Record<string, unknown>;
    };
    runtime.default.drm = { FairPlay: { initDataTransform: transform } };
    const getContentId = vi.fn((uri: string) => uri.replace("skd://", ""));
    const certificate = new Uint8Array([1, 2, 3]);
    const engine = new ShakaVideoEngine({ runtimeLoader: async () => runtime });
    await engine.attach(asMediaElement(new FakeMediaElement()));
    await engine.load({
      src: "protected.m3u8",
      drm: {
        fairplay: {
          licenseUrl: "https://license.example/fairplay",
          certificate,
          getContentId,
        },
      },
    });

    const configuration = player.configurations[0] as {
      drm: {
        initDataTransform: (
          data: Uint8Array,
          type: string,
          info?: { serverCertificate?: Uint8Array },
        ) => Uint8Array;
      };
    };
    const webmData = new Uint8Array([9, 8, 7]);
    expect(configuration.drm.initDataTransform(webmData, "webm")).toStrictEqual(
      webmData,
    );
    expect(transform).not.toHaveBeenCalled();

    const skdData = new TextEncoder().encode("skd://asset-id");
    configuration.drm.initDataTransform(skdData, "skd", {
      serverCertificate: certificate,
    });
    expect(getContentId).toHaveBeenCalledWith("skd://asset-id");
    expect(transform).toHaveBeenCalledOnce();
    const [transformedData, contentId, transformedCertificate] =
      transform.mock.calls[0] ?? [];
    expect(Array.from(transformedData ?? [])).toEqual(Array.from(skdData));
    expect(contentId).toBe("asset-id");
    expect(Array.from(transformedCertificate ?? [])).toEqual(
      Array.from(certificate),
    );

    getContentId.mockClear();
    const utf16SkdData = new Uint8Array(
      Array.from("skd://utf16", (character) => [
        character.charCodeAt(0),
        0,
      ]).flat(),
    );
    configuration.drm.initDataTransform(utf16SkdData, "skd", {
      serverCertificate: certificate,
    });
    expect(getContentId).toHaveBeenCalledWith("skd://utf16");
  });

  it("ignores completion from a superseded load", async () => {
    const player = new FakeShakaPlayer();
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    player.load
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = () => resolve(undefined))),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = () => resolve(undefined))),
      );
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));

    const first = engine.load({ src: "first.mpd" });
    const second = engine.load({ src: "second.mpd" });
    resolveSecond?.();
    await second;
    resolveFirst?.();
    await first;

    expect(engine.getSnapshot().source?.src).toBe("second.mpd");
    expect(engine.getSnapshot().lifecycle).toBe("ready");
  });

  it("normalizes Shaka errors and cleans up terminal resources", async () => {
    const player = new FakeShakaPlayer();
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    const onError = vi.fn();
    engine.on("error", onError);
    await engine.attach(asMediaElement(new FakeMediaElement()));

    player.dispatch("error", {
      detail: { severity: 2, category: 6, code: 6001, data: ["license"] },
    });
    expect(onError).toHaveBeenCalledWith({
      error: expect.objectContaining({
        category: "DRM",
        code: "SHAKA_6001",
        fatal: true,
      }),
    });

    await engine.destroy();
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(player.listeners.get("error")?.size ?? 0).toBe(0);
    expect(engine.getSnapshot().lifecycle).toBe("destroyed");
  });

  it("adopts the early Shaka player and loads its PreloadManager", async () => {
    const player = new FakeShakaPlayer();
    const manager = new FakePreloadManager();
    const runtime = runtimeFor(player) as {
      default: { Player: ReturnType<typeof vi.fn> };
    };
    setEarlyShakaPreloadSessionForTests({
      manifestUrl: "lesson.m3u8",
      player,
      preloadPromise: Promise.resolve(manager),
      consumed: false,
      ready: Promise.resolve(),
    });
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtime,
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));
    await engine.load({
      src: "lesson.m3u8",
      kind: "hls",
      startTime: 8,
    });

    expect(runtime.default.Player).not.toHaveBeenCalled();
    expect(player.resetConfiguration).not.toHaveBeenCalled();
    expect(player.load).toHaveBeenCalledWith(manager, 8);
    expect(player.preload).not.toHaveBeenCalled();
  });

  it("falls back to the URL load on the same player when preload is null", async () => {
    const player = new FakeShakaPlayer();
    setEarlyShakaPreloadSessionForTests({
      manifestUrl: "lesson.m3u8",
      player,
      preloadPromise: Promise.resolve(null),
      consumed: false,
      ready: Promise.resolve(),
    });
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));
    await engine.load({ src: "lesson.m3u8", kind: "hls" });

    expect(player.load).toHaveBeenCalledWith(
      "lesson.m3u8",
      undefined,
      "application/x-mpegurl",
    );
  });

  it("does not consume a preload session for a different manifest", async () => {
    const player = new FakeShakaPlayer();
    const manager = new FakePreloadManager();
    setEarlyShakaPreloadSessionForTests({
      manifestUrl: "first.m3u8",
      player,
      preloadPromise: Promise.resolve(manager),
      consumed: false,
      ready: Promise.resolve(),
    });
    const engine = new ShakaVideoEngine({
      runtimeLoader: async () => runtimeFor(player),
    });
    await engine.attach(asMediaElement(new FakeMediaElement()));
    await engine.load({ src: "second.m3u8", kind: "hls" });

    expect(player.load).toHaveBeenCalledWith(
      "second.m3u8",
      undefined,
      "application/x-mpegurl",
    );
    await vi.waitFor(() => expect(manager.destroy).toHaveBeenCalledOnce());
  });
});
