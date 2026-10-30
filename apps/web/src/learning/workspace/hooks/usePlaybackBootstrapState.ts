import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { VideoPlaybackBootstrap } from "@veolms/contracts";
import {
  getCachedVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
  VideoPlaybackBootstrapError,
} from "../../videoPlaybackBootstrap";

export interface UsePlaybackBootstrapStateArgs {
  courseSlug: string | undefined;
  isAuthenticated: boolean;
  selectedLesson: number;
  setPlaybackBootstrapError: Dispatch<
    SetStateAction<VideoPlaybackBootstrapError | null>
  >;
}

export interface UsePlaybackBootstrapStateResult {
  protectedPlayback: boolean;
  playbackRequestKey: string;
  playbackBootstrap: VideoPlaybackBootstrap | null;
  setPlaybackBootstrap: Dispatch<SetStateAction<VideoPlaybackBootstrap | null>>;
  playbackBootstrapAttempt: number;
  playbackRequestKeyRef: RefObject<string | null>;
  refreshPlaybackToken: () => Promise<{ token: string; expiresAt: number }>;
  retryPlaybackBootstrap: () => void;
}

export function usePlaybackBootstrapState({
  courseSlug,
  isAuthenticated,
  selectedLesson,
  setPlaybackBootstrapError,
}: UsePlaybackBootstrapStateArgs): UsePlaybackBootstrapStateResult {
  const protectedPlayback = Boolean(courseSlug);
  const playbackRequestKey = `${courseSlug ?? ""}\u0000${selectedLesson}\u0000${isAuthenticated ? "authenticated" : "guest"}`;
  // Each bootstrap is kept with the lesson it was set for. It is replaced by
  // an effect, a render after another lesson is selected; for that render
  // the last lesson's used to be handed on, and the player, already given
  // the new lesson's key, loaded the lesson being left again under it and
  // played it on while the new one's bootstrap was on its way. Now a
  // lesson only ever gets its own (or, until it has it, the one cached for
  // it, or none).
  const lessonKey = `${courseSlug ?? ""}\u0000${selectedLesson}`;
  const [storedBootstrap, setStoredBootstrap] = useState<{
    lessonKey: string;
    bootstrap: VideoPlaybackBootstrap | null;
  }>(() => ({
    lessonKey,
    bootstrap: courseSlug
      ? getCachedVideoPlaybackBootstrap({
          courseSlug,
          lessonNumber: selectedLesson,
        })
      : null,
  }));
  const setPlaybackBootstrap = useCallback<
    Dispatch<SetStateAction<VideoPlaybackBootstrap | null>>
  >(
    (next) =>
      setStoredBootstrap((current) => {
        const bootstrap =
          typeof next === "function"
            ? next(current.lessonKey === lessonKey ? current.bootstrap : null)
            : next;
        return current.lessonKey === lessonKey &&
          current.bootstrap === bootstrap
          ? current
          : { lessonKey, bootstrap };
      }),
    [lessonKey],
  );
  const playbackBootstrap =
    storedBootstrap.lessonKey === lessonKey
      ? storedBootstrap.bootstrap
      : courseSlug
        ? getCachedVideoPlaybackBootstrap({
            courseSlug,
            lessonNumber: selectedLesson,
          })
        : null;
  const [playbackBootstrapAttempt, setPlaybackBootstrapAttempt] = useState(0);
  const playbackRequestKeyRef = useRef<string | null>(null);
  const refreshPlaybackToken = useCallback(async () => {
    if (!courseSlug) {
      throw new Error("A course is required to refresh playback access.");
    }
    return refreshVideoPlaybackToken({
      courseSlug,
      lessonNumber: selectedLesson,
    });
  }, [courseSlug, selectedLesson]);

  const retryPlaybackBootstrap = useCallback(() => {
    playbackRequestKeyRef.current = null;
    setPlaybackBootstrapError(null);
    setPlaybackBootstrap(null);
    setPlaybackBootstrapAttempt((attempt) => attempt + 1);
  }, [setPlaybackBootstrap, setPlaybackBootstrapError]);
  return {
    protectedPlayback,
    playbackRequestKey,
    playbackBootstrap,
    setPlaybackBootstrap,
    playbackBootstrapAttempt,
    playbackRequestKeyRef,
    refreshPlaybackToken,
    retryPlaybackBootstrap,
  };
}
