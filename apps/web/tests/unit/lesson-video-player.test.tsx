import { act, render, waitFor } from "@testing-library/react";
import type {
  VideoEngineEventMap,
  VideoLoadOptions,
  VideoSource,
  VideoTextTrack,
} from "@veolms/video-player";
import { FakeVideoEngine } from "@veolms/video-player/testing";
import { describe, expect, it, vi } from "vitest";
import type { CourseVideo } from "../../src/learning/courseContent.js";
import { LessonVideoPlayer } from "../../src/learning/player/LessonVideoPlayer.js";
import { lessonPlayerStorageKeys } from "../../src/learning/player/lessonPlayerPersistence.js";

const englishCaptions: VideoTextTrack = {
  id: "captions-en",
  label: "English",
  language: "en",
  active: false,
  kind: "captions",
  roles: [],
};

class RecordingFakeVideoEngine extends FakeVideoEngine {
  readonly loadCalls: Array<{
    source: VideoSource;
    options: VideoLoadOptions | undefined;
  }> = [];

  readonly selectedTextTrackIds: Array<string | null> = [];

  readonly #textTrackListeners = new Set<
    (detail: VideoEngineEventMap["texttrackchange"]) => void
  >();

  override async load(
    source: VideoSource,
    options?: VideoLoadOptions,
  ): Promise<void> {
    this.loadCalls.push({ source, options });
    await super.load(source, options);
  }

  override selectTextTrack(id: string | null): void {
    this.selectedTextTrackIds.push(id);
    super.selectTextTrack(id);
    const track =
      id === null
        ? null
        : (this.getSnapshot().textTracks.find((item) => item.id === id) ??
          null);
    for (const listener of this.#textTrackListeners) listener({ track });
  }

  override on<Type extends keyof VideoEngineEventMap>(
    type: Type,
    listener: (event: VideoEngineEventMap[Type]) => void,
  ): () => void {
    const unsubscribeFromEngine = super.on(type, listener);
    if (type !== "texttrackchange") return unsubscribeFromEngine;

    const textTrackListener = listener as (
      detail: VideoEngineEventMap["texttrackchange"],
    ) => void;
    this.#textTrackListeners.add(textTrackListener);
    return () => {
      unsubscribeFromEngine();
      this.#textTrackListeners.delete(textTrackListener);
    };
  }
}

const firstMedia: CourseVideo = {
  fileName: "lesson-one.mp4",
  duration: 90,
  src: "/course-videos/lesson-one.mp4",
};

const secondMedia: CourseVideo = {
  fileName: "lesson-two.mp4",
  duration: 150,
  src: "/course-videos/lesson-two.mp4",
};

function playerProps(media: CourseVideo, engine: RecordingFakeVideoEngine) {
  return {
    media,
    lessonTitle: "Designing for real users",
    theaterMode: false,
    onTheaterToggle: vi.fn(),
    engineFactory: () => engine,
  };
}

describe("LessonVideoPlayer adapter", () => {
  it("keeps the ambient projection behind the foreground player", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const { container } = render(
      <LessonVideoPlayer {...playerProps(firstMedia, engine)} />,
    );

    const shell = container.querySelector<HTMLElement>(".video-shell");
    const player = container.querySelector<HTMLElement>(".youtube-player");
    expect(shell).not.toBeNull();
    expect(player).not.toBeNull();

    await waitFor(() => {
      const projection = container.querySelector<HTMLCanvasElement>(
        "[data-ambient-inline-projection]",
      );
      expect(projection).not.toBeNull();
      expect(projection?.parentElement).toBe(shell);
      expect(player?.contains(projection)).toBe(false);
      expect(projection).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("maps lesson media into the package source contract and loads it", async () => {
    const engine = new RecordingFakeVideoEngine(90);

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(engine.loadCalls[0]).toEqual({
      source: {
        id: "lesson-one.mp4",
        src: "/course-videos/lesson-one.mp4",
        type: "video/mp4",
        kind: "file",
        startTime: 0,
        metadata: {
          duration: 90,
          title: "Designing for real users",
        },
        textTracks: [
          {
            src: "/assets/designing-users.vtt",
            language: "en",
            label: "English",
            kind: "captions",
            mimeType: "text/vtt",
          },
        ],
      },
      options: undefined,
    });
    expect(engine.getSnapshot().lifecycle).toBe("ready");
  });

  it("restores against the actual media duration and reports progress on load", async () => {
    const engine = new RecordingFakeVideoEngine(200);
    const onProgressChange = vi.fn();
    window.localStorage.setItem(
      lessonPlayerStorageKeys.resume(firstMedia.fileName),
      "50",
    );

    render(
      <LessonVideoPlayer
        {...playerProps({ ...firstMedia, duration: 10 }, engine)}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(engine.loadCalls[0]?.source.startTime).toBe(50);
    expect(engine.getSnapshot().currentTime).toBe(50);
    await waitFor(() => expect(onProgressChange).toHaveBeenCalledWith(25));
  });

  it("restores an enabled caption preference after changing lessons", async () => {
    const engine = new RecordingFakeVideoEngine(180);
    engine.setSnapshot({ textTracks: [englishCaptions] });
    const props = playerProps(firstMedia, engine);
    const { rerender } = render(<LessonVideoPlayer {...props} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    act(() => engine.selectTextTrack(englishCaptions.id));
    expect(engine.selectedTextTrackIds).toEqual([englishCaptions.id]);

    rerender(
      <LessonVideoPlayer
        {...props}
        media={secondMedia}
        lessonTitle="The design mindset"
      />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(2));
    await waitFor(() =>
      expect(engine.selectedTextTrackIds).toEqual([
        englishCaptions.id,
        englishCaptions.id,
      ]),
    );
    expect(engine.loadCalls[1]?.source).toMatchObject({
      id: "lesson-two.mp4",
      src: "/course-videos/lesson-two.mp4",
      metadata: { title: "The design mindset" },
    });
  });
});
