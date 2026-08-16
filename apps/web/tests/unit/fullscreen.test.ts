import { describe, expect, it, vi } from "vitest";
import {
  canToggleDocumentFullscreen,
  getDocumentFullscreenElement,
  toggleDocumentFullscreen,
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
});
