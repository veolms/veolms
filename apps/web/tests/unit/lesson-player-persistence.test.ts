import { describe, expect, it, vi } from "vitest";
import {
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readMutedPreference,
  readResumePosition,
  writeAmbientPreference,
  writeMutedPreference,
  writeResumePosition,
} from "../../src/learning/player/lessonPlayerPersistence.js";

const storageWith = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
});

describe("lesson player persistence", () => {
  it("restores legacy muted and ambient preference values", () => {
    expect(
      readMutedPreference(
        storageWith({ [lessonPlayerStorageKeys.muted]: "on" }),
      ),
    ).toBe(true);
    expect(
      readAmbientPreference(
        storageWith({ [lessonPlayerStorageKeys.ambient]: "off" }),
        false,
      ),
    ).toBe(false);
  });

  it("uses the device-sensitive ambient default when no preference exists", () => {
    const emptyStorage = storageWith({});
    expect(readAmbientPreference(emptyStorage, false)).toBe(true);
    expect(readAmbientPreference(emptyStorage, true)).toBe(false);
  });

  it("isolates and clamps resume positions by caller-provided media key", () => {
    const mediaKey = "course-a-lesson-7";
    const storage = storageWith({
      [lessonPlayerStorageKeys.resume(mediaKey)]: "120",
    });

    expect(readResumePosition(mediaKey, 90, storage)).toBe(89);
    expect(readResumePosition(mediaKey, undefined, storage)).toBe(120);
    expect(readResumePosition("another-lesson", 90, storage)).toBe(0);
  });

  it("keeps playback available when storage access is blocked", () => {
    const blockedStorage = {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    };

    expect(readMutedPreference(blockedStorage)).toBe(false);
    expect(readAmbientPreference(blockedStorage, true)).toBe(false);
    expect(readResumePosition("lesson", 90, blockedStorage)).toBe(0);
    expect(() => writeMutedPreference(true, blockedStorage)).not.toThrow();
    expect(() => writeAmbientPreference(true, blockedStorage)).not.toThrow();
    expect(() =>
      writeResumePosition("lesson", 12, blockedStorage),
    ).not.toThrow();
  });

  it("writes values using the existing storage contract", () => {
    const setItem = vi.fn();
    const storage = { setItem };

    writeMutedPreference(true, storage);
    writeAmbientPreference(false, storage);
    writeResumePosition("course-a-lesson-7", 42, storage);

    expect(setItem).toHaveBeenNthCalledWith(
      1,
      lessonPlayerStorageKeys.muted,
      "true",
    );
    expect(setItem).toHaveBeenNthCalledWith(
      2,
      lessonPlayerStorageKeys.ambient,
      "off",
    );
    expect(setItem).toHaveBeenNthCalledWith(
      3,
      "veolms-watch-course-a-lesson-7",
      "42",
    );
  });
});
