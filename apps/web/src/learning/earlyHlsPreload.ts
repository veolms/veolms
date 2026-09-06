import { startEarlyShakaPreload } from "@veolms/video-player/shaka-preload";
import { readLearningHlsBootstrapFromDocument } from "./learningHlsBootstrap";
import { createLearningHlsPreloadSource } from "./player/learningHlsPreloadSource";

const bootstrap = readLearningHlsBootstrapFromDocument();
if (bootstrap) {
  void startEarlyShakaPreload(
    createLearningHlsPreloadSource({
      manifestUrl: bootstrap.manifestUrl,
      mediaKey: bootstrap.mediaKey || undefined,
    }),
  );
}
