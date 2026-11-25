import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveYoutubeSource, type MediaSourceRow } from "./youtube-source.ts";

const ID = "8pERv8EbWMs";
const OTHER_ID = "ZRhTj47pctw";

const row = (overrides: Partial<MediaSourceRow> = {}): MediaSourceRow => ({
  provider: "youtube",
  external_id: ID,
  source_url: `https://www.youtube.com/watch?v=${ID}`,
  title: "From the import",
  channel: "A channel",
  ...overrides,
});

await test("an uploaded video with no YouTube record has no source", () => {
  assert.equal(resolveYoutubeSource({}, null), null);
  assert.equal(resolveYoutubeSource(null, undefined), null);
  assert.equal(resolveYoutubeSource({ qualities: ["720"] }, null), null);
});

await test("metadata.youtube gives the id, link and title", () => {
  assert.deepEqual(
    resolveYoutubeSource(
      {
        youtube: {
          id: ID,
          url: `https://www.youtube.com/watch?v=${ID}&list=PL123`,
          title: "  Generics in   TypeScript ",
          playlistId: "PL123",
          playlistTitle: "TypeScript Section 2",
          index: 3,
          mappedAt: "2026-11-25T10:00:00Z",
        },
      },
      null,
    ),
    {
      provider: "youtube",
      externalId: ID,
      url: `https://www.youtube.com/watch?v=${ID}&list=PL123`,
      title: "Generics in TypeScript",
      channel: null,
    },
  );
});

await test("metadata.youtube wins over the import record", () => {
  const source = resolveYoutubeSource(
    { youtube: { id: OTHER_ID, title: "Mapped" } },
    row(),
  );
  assert.equal(source?.externalId, OTHER_ID);
  assert.equal(source?.title, "Mapped");
  assert.equal(source?.channel, null);
});

await test("a mapping without a title takes the import's title for the same video", () => {
  const source = resolveYoutubeSource({ youtube: { id: ID } }, row());
  assert.equal(source?.title, "From the import");
  assert.equal(source?.channel, "A channel");
  assert.equal(source?.url, `https://www.youtube.com/watch?v=${ID}`);
});

await test("the import record is used when there is no mapping", () => {
  assert.deepEqual(resolveYoutubeSource({ youtubeId: OTHER_ID }, row()), {
    provider: "youtube",
    externalId: ID,
    url: `https://www.youtube.com/watch?v=${ID}`,
    title: "From the import",
    channel: "A channel",
  });
});

await test("the older metadata.youtubeId gets a built link and no title", () => {
  assert.deepEqual(
    resolveYoutubeSource(
      {
        youtubeId: ID,
        matchedBy: "duration",
        relinkedAt: "2026-11-21T00:00:00Z",
      },
      null,
    ),
    {
      provider: "youtube",
      externalId: ID,
      url: `https://www.youtube.com/watch?v=${ID}`,
      title: null,
      channel: null,
    },
  );
});

await test("an older import's sourceUrl is kept when it is a YouTube link", () => {
  const source = resolveYoutubeSource(
    { source: "youtube", youtubeId: ID, sourceUrl: `https://youtu.be/${ID}` },
    null,
  );
  assert.equal(source?.url, `https://youtu.be/${ID}`);
});

await test("a link that is not an https YouTube address is rebuilt from the id", () => {
  for (const url of [
    "javascript:alert(1)",
    `http://www.youtube.com/watch?v=${ID}`,
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://user:pass@www.youtube.com/watch?v=${ID}`,
    "not a url",
    "",
    42,
  ]) {
    assert.equal(
      resolveYoutubeSource({ youtube: { id: ID, url } }, null)?.url,
      `https://www.youtube.com/watch?v=${ID}`,
      String(url),
    );
  }
});

await test("an id that is not a YouTube id is skipped for the next form", () => {
  assert.equal(
    resolveYoutubeSource({ youtube: { id: "<script>" } }, null),
    null,
  );
  assert.equal(
    resolveYoutubeSource(
      { youtube: { id: "short" }, youtubeId: OTHER_ID },
      null,
    )?.externalId,
    OTHER_ID,
  );
  assert.equal(
    resolveYoutubeSource({ youtubeId: 12345678901 }, row({ external_id: "x" })),
    null,
  );
  assert.equal(resolveYoutubeSource({ youtube: "abc" }, null), null);
  assert.equal(resolveYoutubeSource([ID], null), null);
});

await test("an empty or very long title is cleaned up", () => {
  assert.equal(
    resolveYoutubeSource({ youtube: { id: ID, title: "   " } }, null)?.title,
    null,
  );
  assert.equal(
    resolveYoutubeSource({ youtube: { id: ID, title: 7 } }, null)?.title,
    null,
  );
  const long = resolveYoutubeSource(
    { youtube: { id: ID, title: "a".repeat(1000) } },
    null,
  )?.title;
  assert.equal(long?.length, 300);
  assert.ok(long?.endsWith("…"));
});
