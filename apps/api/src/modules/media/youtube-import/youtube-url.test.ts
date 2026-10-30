import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalYoutubeWatchUrl,
  parseYoutubeVideoId,
  youtubeImportRequestSchema,
} from "@veolms/contracts";

await test("reads the video id from every single-video link form", () => {
  for (const link of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ]) {
    assert.equal(parseYoutubeVideoId(link), "dQw4w9WgXcQ", link);
  }
  assert.equal(
    canonicalYoutubeWatchUrl("dQw4w9WgXcQ"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
});

await test("refuses playlists, other sites and malformed ids", () => {
  for (const link of [
    "https://www.youtube.com/playlist?list=PL123",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC123",
    "javascript:alert(1)",
    "",
  ]) {
    assert.equal(parseYoutubeVideoId(link), null, link);
  }
});

await test("an import request needs the rights confirmation", () => {
  const base = {
    url: "https://youtu.be/dQw4w9WgXcQ",
    courseId: "046b649a-ecf9-5e05-bace-938def0ba4ee",
    lessonId: "e228ceab-95db-590b-96a3-150c79eede03",
  };
  assert.equal(
    youtubeImportRequestSchema.safeParse({ ...base, rightsConfirmed: true })
      .success,
    true,
  );
  assert.equal(
    youtubeImportRequestSchema.safeParse({ ...base, rightsConfirmed: false })
      .success,
    false,
  );
  assert.equal(youtubeImportRequestSchema.safeParse(base).success, false);
});

await test("a lesson not saved yet imports without a lesson; a lesson needs its course", () => {
  const url = "https://youtu.be/dQw4w9WgXcQ";
  const lessonId = "e228ceab-95db-590b-96a3-150c79eede03";
  assert.equal(
    youtubeImportRequestSchema.safeParse({ url, rightsConfirmed: true })
      .success,
    true,
  );
  assert.equal(
    youtubeImportRequestSchema.safeParse({
      url,
      lessonId,
      rightsConfirmed: true,
    }).success,
    false,
  );
});
