import { afterEach, describe, expect, it } from "vitest";
import {
  getInitialLearningPlayerPreferences,
  getLearningPlayerBootstrapScript,
} from "../../src/learning/learningPlayerPreferences";

describe("learning player bootstrap", () => {
  afterEach(() => {
    localStorage.clear();
    delete window.__VEO_BOOTSTRAP__;
    delete document.documentElement.dataset.playerAutoplay;
    delete document.documentElement.dataset.playerMuted;
    delete document.documentElement.dataset.playerPlaybackRate;
    delete document.documentElement.dataset.playerVolume;
    document.querySelector("[data-player-bootstrap-test]")?.remove();
  });

  it("publishes persisted player settings before React initializes", () => {
    localStorage.setItem("veolms-player-autoplay", "off");
    localStorage.setItem("veolms-player-muted", "true");
    localStorage.setItem("veolms-player-playback-rate", "1.5");
    localStorage.setItem("veolms-player-volume", "0.4");
    window.__VEO_BOOTSTRAP__ = {
      sidebar: { mode: "collapsed", width: 280 },
    };

    new Function(getLearningPlayerBootstrapScript())();

    expect(window.__VEO_BOOTSTRAP__).toEqual({
      sidebar: { mode: "collapsed", width: 280 },
      player: {
        autoplay: false,
        muted: true,
        playbackRate: 1.5,
        volume: 0.4,
      },
    });
    expect(document.documentElement.dataset.playerAutoplay).toBe("off");
    expect(document.documentElement.dataset.playerMuted).toBe("true");
    expect(document.documentElement.dataset.playerPlaybackRate).toBe("1.5");
    expect(document.documentElement.dataset.playerVolume).toBe("0.4");

  });

  it("initializes React from the bootstrap snapshot instead of rereading storage", () => {
    localStorage.setItem("veolms-player-autoplay", "on");
    localStorage.setItem("veolms-player-muted", "false");
    localStorage.setItem("veolms-player-playback-rate", "1");
    localStorage.setItem("veolms-player-volume", "1");
    window.__VEO_BOOTSTRAP__ = {
      player: {
        autoplay: false,
        muted: true,
        playbackRate: 1.75,
        volume: 0.2,
      },
    };

    expect(getInitialLearningPlayerPreferences()).toEqual({
      autoplay: false,
      muted: true,
      playbackRate: 1.75,
      volume: 0.2,
    });
  });
});
