import { describe, expect, it, vi } from "vitest";
import {
  canToggleDocumentFullscreen,
  getDocumentFullscreenElement,
  lockScreenOrientation,
  toggleDocumentFullscreen,
  unlockScreenOrientation,
} from "../../src/fullscreen.ts";

describe("fullscreen controls", () => {
  it("requests fullscreen on the document root", async () => {
    const requestFullscreen = vi.fn();
    const target = {
      documentElement: { requestFullscreen },
      fullscreenElement: null,
    } as unknown as Document;

    expect(canToggleDocumentFullscreen(target)).toBe(true);
    await expect(toggleDocumentFullscreen(target)).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("exits fullscreen when an element is active", async () => {
    const exitFullscreen = vi.fn();
    const fullscreenElement = {} as Element;
    const target = {
      documentElement: {},
      fullscreenElement,
      exitFullscreen,
    } as unknown as Document;

    expect(getDocumentFullscreenElement(target)).toBe(fullscreenElement);
    await expect(toggleDocumentFullscreen(target)).resolves.toBe(false);
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it("supports the prefixed WebKit fullscreen API", async () => {
    const webkitRequestFullscreen = vi.fn();
    const target = {
      documentElement: { webkitRequestFullscreen },
      fullscreenElement: null,
      webkitFullscreenElement: null,
    } as unknown as Document;

    await expect(toggleDocumentFullscreen(target)).resolves.toBe(true);
    expect(webkitRequestFullscreen).toHaveBeenCalledOnce();
  });

  it("locks a supported screen orientation to landscape", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    const orientation = { lock };

    await expect(lockScreenOrientation(orientation)).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("handles unavailable orientation locking and unlocks safely", async () => {
    const unlock = vi.fn();
    const orientation = {
      lock: vi.fn().mockRejectedValue(new Error("unsupported")),
      unlock,
    };

    await expect(lockScreenOrientation(orientation)).resolves.toBe(false);
    unlockScreenOrientation(orientation);
    expect(unlock).toHaveBeenCalledOnce();
  });
});
