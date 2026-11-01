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
  const [playbackBootstrap, setPlaybackBootstrap] =
    useState<VideoPlaybackBootstrap | null>(() => {
      if (!courseSlug) return null;
      return getCachedVideoPlaybackBootstrap({
        courseSlug,
        lessonNumber: selectedLesson,
      });
    });
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
  }, [setPlaybackBootstrapError]);
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
