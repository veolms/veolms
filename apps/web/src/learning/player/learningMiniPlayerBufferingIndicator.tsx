import { BufferingIndicator } from "@veolms/video-player";

/**
 * The loader only appears when the video has actually been waiting for data
 * for a second. Pressing play never shows it on its own.
 */
export function LearningMiniPlayerBufferingIndicator() {
  return <BufferingIndicator immediatePlayWaits={false} />;
}
