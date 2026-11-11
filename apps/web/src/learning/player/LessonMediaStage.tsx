import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { ImageIcon as ImageGlyph } from "@phosphor-icons/react/Image";
import { useCallback, useEffect, useState } from "react";
import { LessonAudioPlayer } from "../../courses/curriculum/LessonAudioPlayer";
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
    if (seconds > 0)
      window.localStorage.setItem(key, String(Math.floor(seconds)));
    else window.localStorage.removeItem(key);
  } catch {
    // Without storage the lesson starts from the beginning next time.
  }
}

/**
 * An audio or image lesson, in the place a video lesson's video takes. The
 * file's address is asked for when the lesson opens (it works for a short
 * while, and only for viewers who may open the lesson) and again when it has
 * expired.
 */
export function LessonMediaStage({
  kind,
  courseId,
  lessonId,
  picture = false,
}: {
  kind: MediaKind;
  courseId: string;
  lessonId: string;
  /** A still for the mini player: nothing plays and nothing is fetched. */
  picture?: boolean;
}) {
  const [link, setLink] = useState<{ url: string; mimeType: string } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  // Why the file is not given: the viewer must sign in or get the course.
  const [refusal, setRefusal] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [initialTime] = useState(() =>
    kind === "audio" ? readAudioPosition(lessonId) : 0,
  );

  useEffect(() => {
    if (picture) return undefined;
    let active = true;
    setFailed(false);
    coursesService
      .getLessonMediaLink(courseId, lessonId)
      .then((response) => {
        if (active) setLink({ url: response.url, mimeType: response.mimeType });
      })
      .catch((error: { status?: number }) => {
        if (!active) return;
        setLink(null);
        setFailed(true);
        setRefusal(
          error?.status === 401
            ? "Sign in to open this lesson."
            : error?.status === 403
              ? "Get the course to open this lesson."
              : null,
        );
      });
    return () => {
      active = false;
    };
  }, [courseId, lessonId, attempt, picture]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  // A new address is asked once for an image that would not load (its
  // address expired); a file that still fails is said to.
  const [imageRetried, setImageRetried] = useState(false);

  if (kind === "audio") {
    if (picture) {
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-[16px] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_22%,#050814)_0%,_#05070e_100%)]">
          <Headphones size={48} weight="fill" className="text-(--accent)" />
        </div>
      );
    }
    return (
      <LessonAudioPlayer
        title="Listen to this lesson"
        variant="compact"
        audioUrl={link?.url ?? null}
        initialTime={initialTime}
        onRetry={retry}
        unavailableText={
          failed ? (refusal ?? "This audio could not be loaded.") : null
        }
        onProgress={(seconds, duration) =>
          writeAudioPosition(
            lessonId,
            duration > 0 && duration - seconds < 2 ? 0 : seconds,
          )
        }
        onEnded={() => writeAudioPosition(lessonId, 0)}
      />
    );
  }

  return (
    <div className="flex w-full items-center justify-center">
      {link && !picture ? (
        <img
          src={link.url}
          alt="Lesson image"
          decoding="async"
          // An address that expired while the page was open is asked again.
          onError={() => {
            if (imageRetried) {
              setLink(null);
              setFailed(true);
              return;
            }
            setImageRetried(true);
            retry();
          }}
          className="block max-h-[min(78vh,900px)] w-auto max-w-full rounded-[12px] object-contain shadow-(--card-shadow)"
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted)">
          <ImageGlyph size={40} weight="fill" aria-hidden="true" />
          {failed ? (
            <>
              <p className="m-0 text-sm">
                {refusal ?? "This image could not be loaded."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setImageRetried(false);
                  retry();
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-(--accent) hover:bg-(--hover) cursor-pointer"
              >
                Try again
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
