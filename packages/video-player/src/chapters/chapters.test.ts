import { describe, expect, it } from "vitest";

import { getActiveChapter, getChapterAtTime } from "./getChapterAtTime.ts";
import { normalizeChapters } from "./normalizeChapters.ts";
import {
  parseChaptersFromDescription,
  parseChapterTimestamp,
} from "./parseChaptersFromDescription.ts";
import { resolveChapters } from "./resolveChapters.ts";

describe("parseChapterTimestamp", () => {
  it("parses MM:SS and HH:MM:SS timestamps", () => {
    expect(parseChapterTimestamp("00:00")).toBe(0);
    expect(parseChapterTimestamp("2:13")).toBe(133);
    expect(parseChapterTimestamp("01:05:22")).toBe(3_922);
    expect(parseChapterTimestamp("75:10")).toBe(4_510);
  });

  it("rejects malformed timestamps", () => {
    expect(parseChapterTimestamp("12:99")).toBeNull();
    expect(parseChapterTimestamp("1:60:00")).toBeNull();
    expect(parseChapterTimestamp("-2:00")).toBeNull();
    expect(parseChapterTimestamp("2")).toBeNull();
  });
});

describe("parseChaptersFromDescription", () => {
  it("strictly parses timestamp lines and normalizes their order and ends", () => {
    const chapters = parseChaptersFromDescription(
      [
        "Course overview and links:",
        "2:13 Setup",
        "00:00 Introduction",
        "01:05:22 Deployment",
      ].join("\n"),
      { duration: 4_000 },
    );

    expect(
      chapters.map(({ title, startTime, endTime }) => ({
        title,
        startTime,
        endTime,
      })),
    ).toEqual([
      { title: "Introduction", startTime: 0, endTime: 133 },
      { title: "Setup", startTime: 133, endTime: 3_922 },
      { title: "Deployment", startTime: 3_922, endTime: 4_000 },
    ]);
  });

  it("ignores incidental numbers, URLs, malformed lines, and blank titles", () => {
    const chapters = parseChaptersFromDescription(
      [
        "hello 123",
        "99 bananas",
        "Read https://example.com/watch?t=2:13",
        "Jump to 2:13 for setup",
        "12:99 invalid",
        "-2:00 invalid",
        "02:00   ",
        "* 03:00 Valid bullet chapter",
      ].join("\n"),
    );

    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({
      title: "Valid bullet chapter",
      startTime: 180,
    });
  });

  it("keeps the first valid title when timestamps are duplicated", () => {
    const chapters = parseChaptersFromDescription(
      [
        "00:00 Introduction",
        "02:00 First setup title",
        "02:00 Replacement setup title",
      ].join("\n"),
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "Introduction",
      "First setup title",
    ]);
  });
});

describe("normalizeChapters", () => {
  it("drops invalid and out-of-range chapters without mutating the input", () => {
    const input = [
      { title: " Later ", startTime: 40 },
      { title: "", startTime: 10 },
      { title: "Negative", startTime: -1 },
      { title: "Start", startTime: 0 },
      { title: "At duration", startTime: 60 },
    ] as const;

    const chapters = normalizeChapters(input, { duration: 60 });

    expect(
      chapters.map(({ title, startTime, endTime }) => ({
        title,
        startTime,
        endTime,
      })),
    ).toEqual([
      { title: "Start", startTime: 0, endTime: 40 },
      { title: "Later", startTime: 40, endTime: 60 },
    ]);
    expect(input[0]?.title).toBe(" Later ");
  });

  it("creates stable unique IDs", () => {
    const chapters = normalizeChapters([
      { id: "section", title: "One", startTime: 0 },
      { id: "section", title: "Two", startTime: 10 },
      { title: "Résumé & review", startTime: 20 },
    ]);

    expect(chapters.map((chapter) => chapter.id)).toEqual([
      "section",
      "section-2",
      "chapter-20000-resume-review",
    ]);
  });
});

describe("resolveChapters", () => {
  it("uses manual chapters before metadata and description without combining sources", () => {
    const resolved = resolveChapters({
      duration: 120,
      manualChapters: [{ title: "Manual", startTime: 10 }],
      metadataChapters: [{ title: "Metadata", startTime: 0 }],
      description: "00:00 Description",
    });

    expect(resolved.source).toBe("manual");
    expect(resolved.chapters.map((chapter) => chapter.title)).toEqual([
      "Manual",
    ]);
  });

  it("falls back to the next usable source", () => {
    const metadata = resolveChapters({
      manualChapters: [{ title: "", startTime: 0 }],
      metadataChapters: [{ title: "Metadata", startTime: 0 }],
      description: "00:00 Description",
    });
    const description = resolveChapters({
      metadataChapters: [],
      description: "00:00 Description",
    });
    const empty = resolveChapters({ description: "No timestamps here." });

    expect(metadata.source).toBe("metadata");
    expect(description.source).toBe("description");
    expect(empty).toEqual({ source: null, chapters: [] });
  });
});

describe("getChapterAtTime", () => {
  const chapters = normalizeChapters(
    [
      { title: "One", startTime: 0 },
      { title: "Two", startTime: 10 },
    ],
    { duration: 20 },
  );

  it("uses half-open ranges at chapter boundaries", () => {
    expect(getChapterAtTime(chapters, 0)?.title).toBe("One");
    expect(getChapterAtTime(chapters, 9.999)?.title).toBe("One");
    expect(getChapterAtTime(chapters, 10)?.title).toBe("Two");
    expect(getChapterAtTime(chapters, 20)).toBeNull();
  });

  it("handles invalid times and exposes an active-chapter alias", () => {
    expect(getChapterAtTime(chapters, -1)).toBeNull();
    expect(getChapterAtTime(chapters, Number.NaN)).toBeNull();
    expect(getActiveChapter(chapters, 12)?.title).toBe("Two");
  });
});
