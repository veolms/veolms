import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ImageIcon as ImageGlyph } from "@phosphor-icons/react/Image";
import { useCallback, useEffect, useState } from "react";
import { coursesService } from "../../services/courses/courses.service";

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
 * An image lesson, filling the player's stage as a video's picture does;
 * the stage's own controls row (previous and next, lessons, full screen)
 * stays along its bottom, over it. (An audio lesson plays in the video
 * player itself: see `audioOnly` there.)
 */
export function LessonMediaStage({
  courseId,
  lessonId,
  lessonTitle,
  picture = false,
}: {
  /** Only an image is drawn here; an audio lesson plays in the player. */
  kind: "audio" | "image";
  courseId: string;
  lessonId: string;
  lessonTitle?: string;
  courseTitle?: string;
  /** A still for the mini player: nothing is fetched. */
  picture?: boolean;
}) {
  return (
    // Another lesson's picture starts afresh: no image of the last one, no
    // failure it had.
    <LessonImageStage
      key={`${courseId}/${lessonId}`}
      courseId={courseId}
      lessonId={lessonId}
      lessonTitle={lessonTitle}
      picture={picture}
    />
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
