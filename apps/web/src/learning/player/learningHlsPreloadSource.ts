import { readResumePosition } from "./lessonPlayerPersistence";
import {
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
} from "./learningHlsConstants";

function shouldResumeFromLastPosition(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = JSON.parse(
      localStorage.getItem("veolms-learning-preferences") || "{}",
    ) as { resumeFromLastPosition?: unknown };
    if (typeof stored.resumeFromLastPosition === "boolean") {
      return stored.resumeFromLastPosition;
    }
  } catch {
    // Prefer the product default when preference storage is unavailable.
  }
  return true;
}

export function createLearningHlsPreloadSource(options: {
  manifestUrl: string;
  mediaKey?: string;
}) {
  const startTime =
    options.mediaKey && shouldResumeFromLastPosition()
      ? readResumePosition(options.mediaKey)
      : 0;
  return {
    id: options.mediaKey,
    src: options.manifestUrl,
    type: LEARNING_HLS_MIME_TYPE,
    kind: "hls" as const,
    startTime,
    streaming: { ...LEARNING_HLS_STREAMING },
  };
}
