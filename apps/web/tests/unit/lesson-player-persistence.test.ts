import { describe, expect, it, vi } from "vitest";
import {
  consumeMiniPlayerRestore,
  hasMiniPlayerRestore,
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readAutoplayPreference,
  readMutedPreference,
  readPlaybackRatePreference,
  readResumePosition,
  writeAmbientPreference,
  writeAutoplayPreference,
  writeMutedPreference,
  writeMiniPlayerRestore,
  writePlaybackRatePreference,
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

  it("defaults autoplay on and restores an explicit preference", () => {
    expect(readAutoplayPreference(storageWith({}))).toBe(true);
    expect(
      readAutoplayPreference(
        storageWith({ [lessonPlayerStorageKeys.autoplay]: "off" }),
      ),
    ).toBe(false);
  });

  it("defaults playback speed to normal and restores a valid saved rate", () => {
    expect(readPlaybackRatePreference(storageWith({}))).toBe(1);
    expect(
      readPlaybackRatePreference(
        storageWith({ [lessonPlayerStorageKeys.playbackRate]: "1.75" }),
      ),
    ).toBe(1.75);
    expect(
      readPlaybackRatePreference(
        storageWith({ [lessonPlayerStorageKeys.playbackRate]: "invalid" }),
      ),
    ).toBe(1);
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
    expect(readAutoplayPreference(blockedStorage)).toBe(true);
    expect(readPlaybackRatePreference(blockedStorage)).toBe(1);
    expect(readResumePosition("lesson", 90, blockedStorage)).toBe(0);
    expect(() => writeMutedPreference(true, blockedStorage)).not.toThrow();
    expect(() => writeAmbientPreference(true, blockedStorage)).not.toThrow();
    expect(() => writeAutoplayPreference(true, blockedStorage)).not.toThrow();
    expect(() =>
      writePlaybackRatePreference(1.5, blockedStorage),
    ).not.toThrow();
    expect(() =>
      writeResumePosition("lesson", 12, blockedStorage),
    ).not.toThrow();
  });

  it("writes values using the existing storage contract", () => {
    const setItem = vi.fn();
    const storage = { setItem };

    writeMutedPreference(true, storage);
    writeAmbientPreference(false, storage);
    writeAutoplayPreference(true, storage);
    writePlaybackRatePreference(1.5, storage);
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
      lessonPlayerStorageKeys.autoplay,
      "on",
    );
    expect(setItem).toHaveBeenNthCalledWith(
      4,
      lessonPlayerStorageKeys.playbackRate,
      "1.5",
    );
    expect(setItem).toHaveBeenNthCalledWith(
      5,
      "veolms-watch-course-a-lesson-7",
      "42",
    );
  });

  it("detects a mini-player handoff without consuming its play state", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };

    writeMiniPlayerRestore("lesson-a", true, storage);
    expect(hasMiniPlayerRestore("lesson-a", storage)).toBe(true);
    expect(hasMiniPlayerRestore("lesson-b", storage)).toBe(false);
    expect(consumeMiniPlayerRestore("lesson-a", storage)).toBe(true);
    expect(hasMiniPlayerRestore("lesson-a", storage)).toBe(false);

    writeMiniPlayerRestore("lesson-a", false, storage);
    expect(hasMiniPlayerRestore("lesson-a", storage)).toBe(true);
    expect(consumeMiniPlayerRestore("lesson-a", storage)).toBe(false);
    expect(hasMiniPlayerRestore("lesson-a", storage)).toBe(false);
  });
});
