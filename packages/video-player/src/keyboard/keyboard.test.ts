import { describe, expect, it, vi } from "vitest";
import { PlayerKeyboardArbiter } from "./arbiter.js";
import { createPlayerKeyboardController } from "./controller.js";
import {
  DEFAULT_PLAYER_SHORTCUTS,
  resolvePlayerShortcut,
  resolvePlayerShortcutBindings,
} from "./keymap.js";
import type { PlayerKeyboardActions } from "./types.js";

const keyEvent = (
  type: "keydown" | "keyup",
  code: string,
  options: KeyboardEventInit = {},
) =>
  new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code,
    key: code === "Space" ? " " : code,
    ...options,
  });

const targetedKeyEvent = (
  type: "keydown" | "keyup",
  code: string,
  target: EventTarget,
  options: KeyboardEventInit = {},
) => {
  const event = keyEvent(type, code, options);
  Object.defineProperty(event, "target", { value: target });
  return event;
};

function createActions() {
  return {
    togglePlayPause: vi.fn(),
    seekBy: vi.fn(),
    seekToPercentage: vi.fn(),
    toggleMute: vi.fn(),
    toggleCaptions: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleTheaterMode: vi.fn(),
    togglePictureInPicture: vi.fn(),
    adjustPlaybackRate: vi.fn(),
    beginTemporarySpeedBoost: vi.fn(),
    endTemporarySpeedBoost: vi.fn(),
  } satisfies PlayerKeyboardActions;
}

describe("default player keyboard shortcuts", () => {
  it("preserves every current VeoLMS key mapping", () => {
    const actions = createActions();
    const controller = createPlayerKeyboardController({ actions });

    controller.handleKeyDown(keyEvent("keydown", "KeyK", { key: "k" }));
    controller.handleKeyDown(
      keyEvent("keydown", "ArrowLeft", { key: "ArrowLeft" }),
    );
    controller.handleKeyDown(
      keyEvent("keydown", "ArrowRight", { key: "ArrowRight" }),
    );
    controller.handleKeyDown(keyEvent("keydown", "KeyJ", { key: "j" }));
    controller.handleKeyDown(keyEvent("keydown", "KeyL", { key: "l" }));
    controller.handleKeyDown(keyEvent("keydown", "KeyM", { key: "m" }));
    controller.handleKeyDown(keyEvent("keydown", "KeyC", { key: "c" }));
    controller.handleKeyDown(keyEvent("keydown", "KeyF", { key: "f" }));
    controller.handleKeyDown(keyEvent("keydown", "KeyT", { key: "t" }));
    controller.handleKeyDown(keyEvent("keydown", "KeyI", { key: "i" }));
    controller.handleKeyDown(keyEvent("keydown", "Home", { key: "Home" }));
    controller.handleKeyDown(keyEvent("keydown", "End", { key: "End" }));
    controller.handleKeyDown(
      keyEvent("keydown", "Digit5", { altKey: true, key: "5" }),
    );
    controller.handleKeyDown(
      keyEvent("keydown", "Comma", { key: "<", shiftKey: true }),
    );
    controller.handleKeyDown(
      keyEvent("keydown", "ArrowRight", {
        key: "ArrowRight",
        shiftKey: true,
      }),
    );

    expect(actions.togglePlayPause).toHaveBeenCalledOnce();
    expect(actions.seekBy.mock.calls).toEqual([[-5], [5], [-10], [10]]);
    expect(actions.toggleMute).toHaveBeenCalledOnce();
    expect(actions.toggleCaptions).toHaveBeenCalledOnce();
    expect(actions.toggleFullscreen).toHaveBeenCalledOnce();
    expect(actions.toggleTheaterMode).toHaveBeenCalledOnce();
    expect(actions.togglePictureInPicture).toHaveBeenCalledOnce();
    expect(actions.seekToPercentage.mock.calls).toEqual([[0], [100], [50]]);
    expect(actions.adjustPlaybackRate.mock.calls).toEqual([[-1], [1]]);
  });

  it("toggles Space on release and uses repeated Space as a temporary boost", () => {
    const actions = createActions();
    const controller = createPlayerKeyboardController({ actions });

    const down = keyEvent("keydown", "Space");
    expect(controller.handleKeyDown(down)).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    expect(actions.togglePlayPause).not.toHaveBeenCalled();

    controller.handleKeyUp(keyEvent("keyup", "Space"));
    expect(actions.togglePlayPause).toHaveBeenCalledOnce();

    controller.handleKeyDown(keyEvent("keydown", "Space", { repeat: true }));
    controller.handleKeyDown(keyEvent("keydown", "Space", { repeat: true }));
    expect(actions.beginTemporarySpeedBoost).toHaveBeenCalledOnce();
    expect(controller.isTemporarySpeedBoostActive()).toBe(true);

    controller.handleKeyUp(keyEvent("keyup", "Space"));
    expect(actions.endTemporarySpeedBoost).toHaveBeenCalledOnce();
    expect(actions.togglePlayPause).toHaveBeenCalledOnce();
    expect(controller.isTemporarySpeedBoostActive()).toBe(false);
  });

  it("requires exact modifiers and does not steal unmodified number keys", () => {
    expect(
      resolvePlayerShortcut(
        keyEvent("keydown", "Digit5", { key: "5" }),
        DEFAULT_PLAYER_SHORTCUTS,
      ),
    ).toBeNull();
    expect(
      resolvePlayerShortcut(
        keyEvent("keydown", "Digit5", { altKey: true, key: "5" }),
        DEFAULT_PLAYER_SHORTCUTS,
      ),
    ).toMatchObject({ action: "seekToPercentage", percentage: 50 });
    expect(
      resolvePlayerShortcut(
        keyEvent("keydown", "KeyK", { ctrlKey: true, key: "k" }),
        DEFAULT_PLAYER_SHORTCUTS,
      ),
    ).toBeNull();
  });
});

describe("shortcut guards and configuration", () => {
  it("ignores editing targets while allowing focused controls and the player root", () => {
    const actions = createActions();
    const root = document.createElement("section");
    root.tabIndex = 0;
    const input = document.createElement("input");
    const button = document.createElement("button");
    root.append(input, button);
    document.body.append(root);
    const controller = createPlayerKeyboardController({
      actions,
      getPlayerRoot: () => root,
    });

    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "KeyK", input, { key: "k" }),
      ),
    ).toBe(false);

    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "KeyK", button, { key: "k" }),
      ),
    ).toBe(true);
    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "Space", button, { key: " " }),
      ),
    ).toBe(false);
    button.dataset.playerShortcutSurface = "";
    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "Space", button, { key: " " }),
      ),
    ).toBe(true);
    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "KeyK", root, { key: "k" }),
      ),
    ).toBe(true);
    expect(actions.togglePlayPause).toHaveBeenCalledTimes(2);
    root.remove();
  });

  it("preserves arrow, Home, and End navigation owned by sliders", () => {
    const actions = createActions();
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    document.body.append(slider);
    const controller = createPlayerKeyboardController({ actions });

    for (const code of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      const event = targetedKeyEvent("keydown", code, slider, { key: code });
      expect(controller.handleKeyDown(event)).toBe(false);
    }
    expect(actions.seekBy).not.toHaveBeenCalled();
    expect(actions.seekToPercentage).not.toHaveBeenCalled();
    slider.remove();
  });

  it("preserves menu navigation while allowing non-navigation shortcuts", () => {
    const actions = createActions();
    const menuItem = document.createElement("button");
    menuItem.setAttribute("role", "menuitem");
    document.body.append(menuItem);
    const controller = createPlayerKeyboardController({ actions });

    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "Home", menuItem, { key: "Home" }),
      ),
    ).toBe(false);
    expect(
      controller.handleKeyDown(
        targetedKeyEvent("keydown", "KeyM", menuItem, { key: "m" }),
      ),
    ).toBe(true);
    expect(actions.toggleMute).toHaveBeenCalledOnce();
    menuItem.remove();
  });

  it("supports overriding and disabling individual bindings", () => {
    const bindings = resolvePlayerShortcutBindings({
      playPause: ["KeyP"],
      toggleMute: false,
    });
    expect(
      resolvePlayerShortcut(
        keyEvent("keydown", "KeyK", { key: "k" }),
        bindings,
      ),
    ).toBeNull();
    expect(
      resolvePlayerShortcut(keyEvent("keydown", "KeyP", { key: "p" }), bindings)
        ?.action,
    ).toBe("playPause");
    expect(
      resolvePlayerShortcut(
        keyEvent("keydown", "KeyM", { key: "m" }),
        bindings,
      ),
    ).toBeNull();
    expect(
      resolvePlayerShortcut(
        keyEvent("keydown", "ArrowLeft", { key: "ArrowLeft" }),
        bindings,
      )?.action,
    ).toBe("seekBackward");
  });
});

describe("PlayerKeyboardArbiter", () => {
  it("routes page-wide keys to only the active player", () => {
    const firstRoot = document.createElement("section");
    const secondRoot = document.createElement("section");
    document.body.append(firstRoot, secondRoot);
    const firstActions = createActions();
    const secondActions = createActions();
    const arbiter = new PlayerKeyboardArbiter();
    const first = arbiter.register({
      id: "first",
      controller: createPlayerKeyboardController({ actions: firstActions }),
      getRoot: () => firstRoot,
    });
    const second = arbiter.register({
      id: "second",
      controller: createPlayerKeyboardController({ actions: secondActions }),
      getRoot: () => secondRoot,
    });

    arbiter.handleKeyDown(keyEvent("keydown", "KeyK", { key: "k" }));
    expect(firstActions.togglePlayPause).toHaveBeenCalledOnce();
    expect(secondActions.togglePlayPause).not.toHaveBeenCalled();

    const targetedEvent = targetedKeyEvent("keydown", "KeyK", secondRoot, {
      key: "k",
    });
    arbiter.handleKeyDown(targetedEvent);
    expect(second.isActive()).toBe(true);
    expect(secondActions.togglePlayPause).toHaveBeenCalledOnce();

    arbiter.handleKeyDown(keyEvent("keydown", "KeyK", { key: "k" }));
    expect(secondActions.togglePlayPause).toHaveBeenCalledTimes(2);
    first.activate();
    expect(arbiter.getActivePlayerId()).toBe("first");

    second.unregister();
    first.unregister();
    firstRoot.remove();
    secondRoot.remove();
  });

  it("attaches one set of global listeners and releases boosts on blur", () => {
    const actions = createActions();
    const arbiter = new PlayerKeyboardArbiter();
    arbiter.register({
      id: "player",
      controller: createPlayerKeyboardController({ actions }),
      getRoot: () => null,
    });
    const detach = arbiter.attach(window);

    window.dispatchEvent(keyEvent("keydown", "Space", { repeat: true }));
    expect(actions.beginTemporarySpeedBoost).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("blur"));
    expect(actions.endTemporarySpeedBoost).toHaveBeenCalledOnce();

    detach();
    window.dispatchEvent(keyEvent("keydown", "KeyK", { key: "k" }));
    expect(actions.togglePlayPause).not.toHaveBeenCalled();
    arbiter.dispose();
  });
});
