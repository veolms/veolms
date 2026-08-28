import { describe, expect, it } from "vitest";
import {
  formatMediaTime,
  formatTimeForScreenReader,
} from "./formatMediaTime.ts";

describe("media time formatting", () => {
  it("formats clock values without leaking invalid input", () => {
    expect(formatMediaTime(0)).toBe("00:00");
    expect(formatMediaTime(65.9)).toBe("01:05");
    expect(formatMediaTime(3_661)).toBe("1:01:01");
    expect(formatMediaTime(Number.NaN)).toBe("00:00");
    expect(formatMediaTime(-20)).toBe("00:00");
  });

  it("produces screen-reader friendly durations", () => {
    expect(formatTimeForScreenReader(0)).toBe("0 seconds");
    expect(formatTimeForScreenReader(61)).toBe("1 minute, 1 second");
    expect(formatTimeForScreenReader(7_322)).toBe(
      "2 hours, 2 minutes, 2 seconds",
    );
  });
});
