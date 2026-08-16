import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNumberShortcutIndex,
  isApplePlatform,
  normalizeShortcutPlatformPreference,
  persistShortcutPlatformPreference,
  readShortcutPlatformPreference,
  resolveShortcutPlatform,
  SHORTCUT_PLATFORM_PREFERENCE_EVENT,
  SHORTCUT_PLATFORM_PREFERENCE_KEY,
} from "../../src/keyboardShortcuts";

beforeEach(() => {
  localStorage.clear();
});

describe("keyboard shortcut helpers", () => {
  it("maps bare number keys to zero-based navigation positions", () => {
    expect(
      getNumberShortcutIndex({
        key: "3",
        code: "Digit3",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(2);
    expect(
      getNumberShortcutIndex({
        key: "3",
        code: "Digit3",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBeNull();
    expect(
      getNumberShortcutIndex({
        key: "0",
        code: "Digit0",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBeNull();
    expect(
      getNumberShortcutIndex({
        key: "£",
        code: "Digit3",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(2);
  });

  it("recognizes Apple platforms for Command shortcut labels", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
  });

  it("follows the detected system unless the user selects an override", () => {
    expect(resolveShortcutPlatform("system", "MacIntel")).toBe("mac");
    expect(resolveShortcutPlatform("system", "Win32")).toBe("windows");
    expect(resolveShortcutPlatform("windows", "MacIntel")).toBe("windows");
    expect(resolveShortcutPlatform("mac", "Win32")).toBe("mac");
  });

  it("normalizes, stores, and announces the shortcut style preference", () => {
    expect(normalizeShortcutPlatformPreference("unsupported")).toBe("system");
    expect(readShortcutPlatformPreference()).toBe("system");

    const preferenceChanged = vi.fn();
    window.addEventListener(
      SHORTCUT_PLATFORM_PREFERENCE_EVENT,
      preferenceChanged,
    );

    expect(persistShortcutPlatformPreference("mac")).toBe("mac");
    expect(localStorage.getItem(SHORTCUT_PLATFORM_PREFERENCE_KEY)).toBe("mac");
    expect(readShortcutPlatformPreference()).toBe("mac");
    expect(preferenceChanged).toHaveBeenCalledTimes(1);

    window.removeEventListener(
      SHORTCUT_PLATFORM_PREFERENCE_EVENT,
      preferenceChanged,
    );
  });

  it("keeps shortcut preferences usable when browser storage is blocked", () => {
    const preferenceChanged = vi.fn();
    window.addEventListener(
      SHORTCUT_PLATFORM_PREFERENCE_EVENT,
      preferenceChanged,
    );
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readShortcutPlatformPreference()).toBe("system");
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => persistShortcutPlatformPreference("mac")).not.toThrow();
    expect(preferenceChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      SHORTCUT_PLATFORM_PREFERENCE_EVENT,
      preferenceChanged,
    );
  });
});
