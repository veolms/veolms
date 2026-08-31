import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatRelativeDate,
  formatSessionDevice,
  isMobileSession,
} from "../../src/settings/sessionDisplay.ts";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

describe("formatSessionDevice", () => {
  it("summarizes a desktop Chrome user agent", () => {
    expect(formatSessionDevice(CHROME_WINDOWS)).toBe("Chrome on Windows");
  });

  it("detects Safari on macOS and Firefox on Linux", () => {
    expect(
      formatSessionDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(
      formatSessionDevice(
        "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
      ),
    ).toBe("Firefox on Linux");
  });

  it("falls back when the user agent is missing", () => {
    expect(formatSessionDevice(null)).toBe("Unknown device");
    expect(formatSessionDevice("   ")).toBe("Unknown device");
  });
});

describe("isMobileSession", () => {
  it("treats phones as mobile and desktop browsers as not", () => {
    expect(
      isMobileSession(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      ),
    ).toBe(true);
    expect(isMobileSession(CHROME_WINDOWS)).toBe(false);
  });
});

describe("formatRelativeDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("describes recent and older activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));

    expect(formatRelativeDate("2026-08-30T11:59:40.000Z")).toBe("Just now");
    expect(formatRelativeDate("2026-08-30T11:45:00.000Z")).toBe("15m ago");
    expect(formatRelativeDate("2026-08-20T12:00:00.000Z")).toBe("10d ago");
    expect(formatRelativeDate(undefined)).toBe("Unknown");
  });
});
