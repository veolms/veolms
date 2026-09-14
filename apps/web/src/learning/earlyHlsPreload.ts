import { startEarlyShakaPreload } from "@veolms/video-player/shaka-preload";
import {
  readLearningHlsBootstrapFromDocument,
  readLearningPlaybackRequestMetadataFromDocument,
  type LearningHlsBootstrap,
  type LearningPlaybackRequestMetadata,
} from "./learningHlsBootstrap";
import { createLearningHlsPreloadSource } from "./player/learningHlsPreloadSource";
import {
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
} from "./videoPlaybackBootstrap";

let inFlight:
  | {
      key: string;
      promise: ReturnType<typeof startEarlyShakaPreload>;
    }
  | undefined;
let latestRequestKey: string | undefined;

function getRequestKey(
  bootstrap: LearningHlsBootstrap | null,
  requestMetadata: LearningPlaybackRequestMetadata | null,
): string | undefined {
  if (requestMetadata) {
    return `${requestMetadata.courseSlug}\u0000${requestMetadata.lessonNumber}`;
  }
  if (bootstrap) {
    return `manifest\u0000${bootstrap.mediaKey}\u0000${bootstrap.manifestUrl}`;
  }
  return undefined;
}

function mark(name: string): void {
  try {
    performance.mark(`veo:${name}`);
  } catch {
    // Performance marks are diagnostic only.
  }
}

function startPreloadForBootstrap(
  bootstrap: LearningHlsBootstrap,
  protectedPlayback: boolean,
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>,
) {
  const key = `${bootstrap.mediaKey}\u0000${bootstrap.manifestUrl}`;
  if (inFlight?.key === key) return inFlight.promise;

  mark("learning-bootstrap-ready");
  const promise = startEarlyShakaPreload(
    createLearningHlsPreloadSource({
      manifestUrl: bootstrap.manifestUrl,
      mediaKey: bootstrap.mediaKey || undefined,
      protectedPlayback,
      segmentToken: bootstrap.segmentToken,
      segmentTokenExpiresAt: bootstrap.segmentTokenExpiresAt,
      refreshSegmentToken,
    }),
  );
  inFlight = { key, promise };
  mark("shaka-preload-started");
  void promise.then(
    () => {
      if (inFlight?.promise === promise) inFlight = undefined;
    },
    () => {
      if (inFlight?.promise === promise) inFlight = undefined;
    },
  );
  return promise;
}

export async function startEarlyHlsPreload(
  bootstrap: LearningHlsBootstrap | null = readLearningHlsBootstrapFromDocument(),
  requestMetadata: LearningPlaybackRequestMetadata | null = readLearningPlaybackRequestMetadataFromDocument(),
) {
  const requestKey = getRequestKey(bootstrap, requestMetadata);
  if (requestKey) latestRequestKey = requestKey;

  if (bootstrap) return startPreloadForBootstrap(bootstrap, false);

  if (!requestMetadata) return null;

  try {
    const playbackBootstrap = await getVideoPlaybackBootstrap({
      courseSlug: requestMetadata.courseSlug,
      lessonNumber: requestMetadata.lessonNumber,
    });
    if (requestKey !== latestRequestKey) return null;
    mark("playback-bootstrap-ready");
    const refreshSegmentToken = playbackBootstrap.segmentToken
      ? async () => {
          const token = await refreshVideoPlaybackToken(requestMetadata);
          return { token: token.token, expiresAt: token.expiresAt };
        }
      : undefined;
    return startPreloadForBootstrap(
      playbackBootstrap,
      playbackBootstrap.source === "paid-bootstrap-api",
      refreshSegmentToken,
    );
  } catch {
    mark("playback-bootstrap-failed");
    return null;
  }
}
