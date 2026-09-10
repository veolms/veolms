import { startEarlyShakaPreload } from "@veolms/video-player/shaka-preload";
import {
  readLearningHlsBootstrapFromDocument,
  readLearningPlaybackRequestMetadataFromDocument,
  type LearningHlsBootstrap,
  type LearningPlaybackRequestMetadata,
} from "./learningHlsBootstrap";
import { createLearningHlsPreloadSource } from "./player/learningHlsPreloadSource";
import { getVideoPlaybackBootstrap } from "./videoPlaybackBootstrap";

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
) {
  const key = `${bootstrap.mediaKey}\u0000${bootstrap.manifestUrl}`;
  if (inFlight?.key === key) return inFlight.promise;

  mark("learning-bootstrap-ready");
  const promise = startEarlyShakaPreload(
    createLearningHlsPreloadSource({
      manifestUrl: bootstrap.manifestUrl,
      mediaKey: bootstrap.mediaKey || undefined,
      protectedPlayback,
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
    const paidBootstrap = await getVideoPlaybackBootstrap({
      courseSlug: requestMetadata.courseSlug,
      lessonNumber: requestMetadata.lessonNumber,
    });
    if (requestKey !== latestRequestKey) return null;
    mark("paid-bootstrap-ready");
    return startPreloadForBootstrap(paidBootstrap, true);
  } catch {
    mark("paid-bootstrap-failed");
    return null;
  }
}
