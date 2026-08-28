import { describe, expect, it, vi } from "vitest";

import { VideoEngineError } from "../../core/errors";
import { NativeVideoEngine } from "./NativeVideoEngine";

class FakeMediaElement extends EventTarget {
  src = "";
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  muted = false;
  playbackRate = 1;
  paused = true;
  ended = false;
  readyState = 0;
  error: MediaError | null = null;
  buffered = createTimeRanges([]);
  seekable = createTimeRanges([]);
  textTracks: TextTrack[] = [];
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  canPlayType = vi.fn(() => "");

  async play(): Promise<void> {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
  }

  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  metadata(duration: number): void {
    this.duration = duration;
    this.readyState = 1;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
}

function createTimeRanges(ranges: Array<[number, number]>): TimeRanges {
  return {
    length: ranges.length,
    start(index: number): number {
      const range = ranges[index];
      if (!range) throw new DOMException("Index out of bounds", "IndexSizeError");
      return range[0];
    },
    end(index: number): number {
      const range = ranges[index];
      if (!range) throw new DOMException("Index out of bounds", "IndexSizeError");
      return range[1];
    },
  };
}

function asMediaElement(media: FakeMediaElement): HTMLMediaElement {
  return media as unknown as HTMLMediaElement;
}

describe("NativeVideoEngine", () => {
  it("loads native media and exposes event-driven state", async () => {
    const media = new FakeMediaElement();
    const engine = new NativeVideoEngine();
    const loaded = vi.fn();
    const snapshots = vi.fn();
    engine.on("loaded", loaded);
    engine.on("snapshotchange", snapshots);
    await engine.attach(asMediaElement(media));

    const load = engine.load({ src: "lesson.mp4", startTime: 15 });
    expect(media.src).toBe("lesson.mp4");
    media.metadata(120);
    await load;

    expect(engine.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      duration: 120,
      currentTime: 15,
      source: { src: "lesson.mp4", startTime: 15 },
    });
    expect(loaded).toHaveBeenCalledWith({
      source: { src: "lesson.mp4", startTime: 15 },
      duration: 120,
    });

    await engine.play();
    expect(engine.getSnapshot().playing).toBe(true);
    engine.pause();
    expect(engine.getSnapshot().paused).toBe(true);
    expect(snapshots).toHaveBeenCalled();
  });

  it("clamps media controls and rejects invalid values", async () => {
    const media = new FakeMediaElement();
    const engine = new NativeVideoEngine();
    await engine.attach(asMediaElement(media));
    media.duration = 100;

    engine.seek(150);
    engine.setVolume(2);
    engine.setMuted(true);
    engine.setPlaybackRate(1.5);

    expect(media.currentTime).toBe(100);
    expect(media.volume).toBe(1);
    expect(media.muted).toBe(true);
    expect(media.playbackRate).toBe(1.5);
    expect(() => engine.seek(Number.NaN)).toThrow(VideoEngineError);
    expect(() => engine.setPlaybackRate(0)).toThrow(VideoEngineError);
  });

  it("treats autoplay policy rejection as a paused state, not a media failure", async () => {
    const media = new FakeMediaElement();
    media.play = vi.fn(async () => {
      throw new DOMException("User activation is required.", "NotAllowedError");
    });
    const engine = new NativeVideoEngine();
    const onError = vi.fn();
    engine.on("error", onError);
    await engine.attach(asMediaElement(media));

    await expect(engine.play()).rejects.toMatchObject({ code: "PLAY_FAILED" });
    expect(engine.getSnapshot().error).toBeNull();
    expect(engine.getSnapshot().paused).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not let an older load overwrite a newer source", async () => {
    const media = new FakeMediaElement();
    const engine = new NativeVideoEngine();
    await engine.attach(asMediaElement(media));

    const first = engine.load({ src: "first.mp4" });
    const second = engine.load({ src: "second.mp4" });
    media.metadata(60);
    await Promise.all([first, second]);

    expect(engine.getSnapshot().source?.src).toBe("second.mp4");
    expect(engine.getSnapshot().lifecycle).toBe("ready");
  });

  it("releases the media element and becomes terminal on destroy", async () => {
    const media = new FakeMediaElement();
    const engine = new NativeVideoEngine();
    await engine.attach(asMediaElement(media));
    media.src = "lesson.mp4";

    await engine.destroy();

    expect(media.pause).toBeDefined();
    expect(media.removeAttribute).toHaveBeenCalledWith("src");
    expect(engine.getSnapshot().lifecycle).toBe("destroyed");
    await expect(engine.attach(asMediaElement(media))).rejects.toMatchObject({
      code: "ENGINE_DESTROYED",
    });
  });
});
