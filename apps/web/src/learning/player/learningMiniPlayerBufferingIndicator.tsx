import { BufferingIndicator } from "@veolms/video-player";

export function LearningMiniPlayerBufferingIndicator() {
  return <BufferingIndicator immediatePlayWaits={false} />;
}
