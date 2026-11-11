import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClockClockwiseIcon as ClockClockwise } from "@phosphor-icons/react/ClockClockwise";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { ImageIcon as ImageGlyph } from "@phosphor-icons/react/Image";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { useCallback, useEffect, useState } from "react";
import {
  AudioSeekBar,
  AudioVolume,
} from "../../courses/curriculum/LessonAudioPlayer";
import {
  formatAudioTime,
  LESSON_AUDIO_SKIP_SECONDS,
  useLessonAudio,
} from "../../courses/curriculum/useLessonAudio";
import { coursesService } from "../../services/courses/courses.service";

type MediaKind = "audio" | "image";

/** Where a learner left off in an audio lesson, kept in this browser. */
const AUDIO_POSITION_PREFIX = "veolms:lesson-audio-position:";

function readAudioPosition(lessonId: string): number {
  try {
    const value = Number(
      window.localStorage.getItem(`${AUDIO_POSITION_PREFIX}${lessonId}`),
    );
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeAudioPosition(lessonId: string, seconds: number) {
  try {
    const key = `${AUDIO_POSITION_PREFIX}${lessonId}`;
    if (seconds > 0) {
      window.localStorage.setItem(key, String(Math.floor(seconds)));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Without storage the lesson starts from the beginning next time.
  }
}

/**
 * The address of the lesson's file: asked for when the lesson opens (it
 * works for a short while, and only for viewers who may open the lesson),
 * and again with `retry` once it has expired. `refused` is the server
 * saying the viewer must sign in or get the course: trying again is no use.
 */
function useLessonMediaLink(
  courseId: string,
  lessonId: string,
  enabled: boolean,
) {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    refused: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    setFailure(null);
    coursesService
      .getLessonMediaLink(courseId, lessonId)
      .then((link) => {
        if (active) setUrl(link.url);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = (error as { status?: number } | null)?.status;
        setUrl(null);
        setFailure(
          status === 401
            ? { message: "Sign in to open this lesson.", refused: true }
            : status === 403
              ? {
                  message: "Get the course to open this lesson.",
                  refused: true,
                }
              : {
                  message: "This lesson's file could not be loaded.",
                  refused: false,
                },
        );
      });
    return () => {
      active = false;
    };
  }, [courseId, lessonId, attempt, enabled]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { url, failure, retry };
}

/**
 * An audio or image lesson, filling the player's stage as a video does;
 * the stage's own controls row (previous and next, lessons, full screen)
 * stays along its bottom, over it.
 */
export function LessonMediaStage({
  kind,
  courseId,
  lessonId,
  lessonTitle,
  courseTitle,
  picture = false,
}: {
  kind: MediaKind;
  courseId: string;
  lessonId: string;
  lessonTitle?: string;
  courseTitle?: string;
  /** A still for the mini player: nothing plays. */
  picture?: boolean;
}) {
  return kind === "audio" ? (
    <LessonAudioStage
      courseId={courseId}
      lessonId={lessonId}
      lessonTitle={lessonTitle}
      courseTitle={courseTitle}
      picture={picture}
    />
  ) : (
    <LessonImageStage
      courseId={courseId}
      lessonId={lessonId}
      lessonTitle={lessonTitle}
      picture={picture}
    />
  );
}

/** The ground an audio lesson stands on: the theme's colour, glowing. */
const AUDIO_BACKDROP =
  "bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--accent)_30%,#060812)_0%,#05070d_62%,#030409_100%)]";

function AudioArtwork({ playing }: { playing: boolean }) {
  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center lg:size-28">
      {/* Rings that breathe while the audio plays. */}
      {playing ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-[28%] bg-(--accent) opacity-15 [animation-duration:2.4s]" />
          <span className="absolute -inset-2 rounded-[30%] bg-(--accent) opacity-10 blur-md" />
        </>
      ) : null}
      <div className="relative flex size-full items-center justify-center rounded-[28%] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent)_45%,#0c122c)_0%,#0b0e1f_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
        <Headphones
          size={44}
          weight="fill"
          className="text-(--accent)"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

const TRANSPORT_BUTTON_CLASS =
  "flex size-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer disabled:opacity-40";

function LessonAudioStage({
  courseId,
  lessonId,
  lessonTitle,
  courseTitle,
  picture,
}: {
  courseId: string;
  lessonId: string;
  lessonTitle?: string;
  courseTitle?: string;
  picture: boolean;
}) {
  const link = useLessonMediaLink(courseId, lessonId, !picture);
  const [initialTime] = useState(() => readAudioPosition(lessonId));
  const audio = useLessonAudio({
    audioUrl: link.url,
    initialTime,
    onProgress: (seconds, duration) =>
      writeAudioPosition(
        lessonId,
        duration > 0 && duration - seconds < 2 ? 0 : seconds,
      ),
    onEnded: () => writeAudioPosition(lessonId, 0),
    mediaSession: lessonTitle
      ? { title: lessonTitle, artist: courseTitle }
      : null,
  });
  const failure =
    link.failure ??
    (audio.failed
      ? { message: "This audio could not be played.", refused: false }
      : null);
  const canPlay = audio.canPlay && !link.failure;
  const { togglePlay, skip } = audio;

  // The keys a video answers to: Space or K plays and pauses, the arrows
  // or J and L skip. Not while typing (a comment, a note) or on a control.
  useEffect(() => {
    if (picture) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT|BUTTON)$/u.test(target.tagName))
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === " " || key === "k") {
        event.preventDefault();
        togglePlay();
      } else if (key === "arrowleft" || key === "j") {
        event.preventDefault();
        skip(-LESSON_AUDIO_SKIP_SECONDS);
      } else if (key === "arrowright" || key === "l") {
        event.preventDefault();
        skip(LESSON_AUDIO_SKIP_SECONDS);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [picture, skip, togglePlay]);

  if (picture) {
    return (
      <div
        className={`absolute inset-0 flex items-center justify-center ${AUDIO_BACKDROP}`}
      >
        <AudioArtwork playing={false} />
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col text-white select-none ${AUDIO_BACKDROP}`}
      data-lesson-audio-stage=""
    >
      {link.url ? (
        <audio
          ref={audio.audioRef}
          src={link.url}
          preload="metadata"
          className="hidden"
        />
      ) : null}

      {/* What is playing, then the transport. A phone's stage is short and
          the title is right under it: the controls alone there. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 pt-12 sm:gap-5 sm:pt-10">
        <div className="hidden max-w-full min-w-0 flex-col items-center gap-3 text-center sm:flex">
          <AudioArtwork playing={audio.isPlaying} />
          <div className="max-w-full min-w-0">
            <p className="m-0 truncate text-lg font-bold tracking-[-0.015em] lg:text-xl">
              {lessonTitle || "Audio lesson"}
            </p>
            {courseTitle ? (
              <p className="m-0 mt-0.5 truncate text-[0.82rem] text-white/60">
                {courseTitle}
              </p>
            ) : null}
          </div>
        </div>

        {failure ? (
          <div
            className="flex flex-col items-center gap-2 text-center"
            role="status"
          >
            <p className="m-0 text-sm text-white/80">{failure.message}</p>
            {failure.refused ? null : (
              <button
                type="button"
                onClick={() => {
                  audio.clearFailure();
                  link.retry();
                }}
                className="rounded-full bg-white/12 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 cursor-pointer"
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-5 sm:gap-7">
            <button
              type="button"
              onClick={() => audio.skip(-LESSON_AUDIO_SKIP_SECONDS)}
              disabled={!canPlay}
              aria-label={`Back ${LESSON_AUDIO_SKIP_SECONDS} seconds`}
              title={`Back ${LESSON_AUDIO_SKIP_SECONDS} seconds (J)`}
              className={TRANSPORT_BUTTON_CLASS}
            >
              <ClockCounterClockwise size={24} weight="bold" />
            </button>
            <button
              type="button"
              onClick={audio.togglePlay}
              disabled={!canPlay}
              aria-label={audio.isPlaying ? "Pause" : "Play"}
              title={audio.isPlaying ? "Pause (K)" : "Play (K)"}
              className="flex size-14 items-center justify-center rounded-full bg-(--accent) text-(--on-accent,#fff) shadow-[0_8px_28px_color-mix(in_srgb,var(--accent)_45%,transparent)] transition-transform hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50 disabled:hover:scale-100 sm:size-16"
            >
              {!link.url || (audio.isBuffering && audio.isPlaying) ? (
                <CircleNotch size={26} className="animate-spin" />
              ) : audio.isPlaying ? (
                <Pause size={26} weight="fill" />
              ) : (
                <Play size={26} weight="fill" className="ml-1" />
              )}
            </button>
            <button
              type="button"
              onClick={() => audio.skip(LESSON_AUDIO_SKIP_SECONDS)}
              disabled={!canPlay}
              aria-label={`Forward ${LESSON_AUDIO_SKIP_SECONDS} seconds`}
              title={`Forward ${LESSON_AUDIO_SKIP_SECONDS} seconds (L)`}
              className={TRANSPORT_BUTTON_CLASS}
            >
              <ClockClockwise size={24} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {/* The timeline, above the stage's own controls row. */}
      <div className="flex items-center gap-2.5 px-4 pb-[4.25rem] text-[0.78rem] font-medium tabular-nums text-white/80 sm:gap-3 sm:px-6">
        <span className="w-10 shrink-0 text-right">
          {formatAudioTime(audio.currentTime)}
        </span>
        <AudioSeekBar audio={audio} disabled={!canPlay} className="flex-1" />
        <span className="w-10 shrink-0">
          {audio.duration > 0 ? formatAudioTime(audio.duration) : "--:--"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <AudioVolume audio={audio} />
          <button
            type="button"
            onClick={audio.cycleSpeed}
            aria-label={`Playback speed ${audio.playbackRate}x`}
            title="Playback speed"
            className="flex h-7 min-w-10 items-center justify-center rounded-md border border-white/20 bg-white/10 px-2 text-[0.74rem] font-semibold text-white/90 transition-colors hover:bg-white/20 cursor-pointer"
          >
            {audio.playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}

function LessonImageStage({
  courseId,
  lessonId,
  lessonTitle,
  picture,
}: {
  courseId: string;
  lessonId: string;
  lessonTitle?: string;
  picture: boolean;
}) {
  const link = useLessonMediaLink(courseId, lessonId, !picture);
  const [loaded, setLoaded] = useState(false);
  // A new address is asked once for a picture that would not load (its
  // address expired); one that still fails is said to.
  const [retried, setRetried] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => setLoaded(false), [link.url]);

  const failure =
    link.failure ??
    (broken
      ? { message: "This image could not be loaded.", refused: false }
      : null);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      {link.url && !broken ? (
        <img
          src={link.url}
          alt={lessonTitle ? `Lesson image: ${lessonTitle}` : "Lesson image"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (retried) {
              setBroken(true);
              return;
            }
            setRetried(true);
            link.retry();
          }}
          className={`h-full w-full object-contain transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
      {!loaded || failure ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
          {failure ? (
            <>
              <ImageGlyph size={36} weight="fill" aria-hidden="true" />
              <p className="m-0 text-sm" role="status">
                {failure.message}
              </p>
              {failure.refused ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setBroken(false);
                    setRetried(false);
                    link.retry();
                  }}
                  className="rounded-full bg-white/12 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 cursor-pointer"
                >
                  Try again
                </button>
              )}
            </>
          ) : picture ? (
            <ImageGlyph size={36} weight="fill" aria-hidden="true" />
          ) : (
            <CircleNotch
              size={30}
              className="animate-spin"
              aria-label="Loading image"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
