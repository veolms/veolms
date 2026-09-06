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

  it("applies persisted player settings before React initializes", () => {
    localStorage.setItem("veolms-player-autoplay", "off");
    localStorage.setItem("veolms-player-muted", "true");
    localStorage.setItem("veolms-player-playback-rate", "1.5");
    localStorage.setItem("veolms-player-volume", "0.4");
    window.__VEO_BOOTSTRAP__ = {
      sidebar: { mode: "collapsed", width: 280 },
    };

    const workspace = document.createElement("div");
    workspace.dataset.playerBootstrapTest = "";
    workspace.innerHTML = `
      <button role="switch" aria-label="Autoplay next lesson" aria-checked="true" title="Autoplay is on">
        <span data-autoplay-track="" data-autoplay-track-state="on"></span>
      </button>
      <button data-volume-level="high" aria-label="Mute" title="Mute" aria-pressed="false"></button>
      <video></video>
    `;
    document.body.append(workspace);
    const media = workspace.querySelector("video");
    if (media) {
      media.muted = false;
      media.volume = 1;
      media.playbackRate = 1;
    }

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

    const autoplaySwitch = workspace.querySelector('[role="switch"]');
    expect(autoplaySwitch).toHaveAttribute("aria-checked", "false");
    expect(autoplaySwitch).toHaveAttribute("title", "Autoplay is off");
    expect(
      workspace.querySelector("[data-autoplay-track]"),
    ).toHaveAttribute("data-autoplay-track-state", "off");
    expect(workspace.querySelector("[data-volume-level]")).toHaveAttribute(
      "aria-label",
      "Unmute",
    );
    expect(media?.muted).toBe(true);
    expect(media?.volume).toBe(0.4);
    expect(media?.playbackRate).toBe(1.5);
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
