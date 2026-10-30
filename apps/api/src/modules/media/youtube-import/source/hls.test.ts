import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  downloadHlsLadder,
  parseMasterPlaylist,
  parseMediaPlaylist,
  readLocalLadder,
  selectVariants,
} from "./hls.ts";

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2",SUBTITLES="vtt",CLOSED-CAPTIONS=NONE
360/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXTINF:4.000,
seg-1.ts
#EXTINF:3.500,
seg-2.ts
#EXT-X-ENDLIST
`;

await test("parses muxed HLS variants and completed MPEG-TS playlists", () => {
  const master = parseMasterPlaylist(
    MASTER,
    "https://example.com/course/master.m3u8",
  );
  assert.deepEqual(
    master.variants.map((variant) => variant.height),
    [360, 720],
  );
  assert.equal(
    master.variants[0]!.url,
    "https://example.com/course/360/index.m3u8",
  );
  const parsed = parseMediaPlaylist(
    MEDIA,
    "https://example.com/course/360/index.m3u8",
  );
  assert.equal(parsed.segments.length, 2);
  assert.equal(parsed.segments[1]!.duration, 3.5);
  assert.equal(
    parsed.segments[0]!.url,
    "https://example.com/course/360/seg-1.ts",
  );
});

await test("rejects live, fMP4 and encrypted source HLS", () => {
  const base = "https://example.com/a.m3u8";
  assert.throws(
    () => parseMediaPlaylist(MEDIA.replace("#EXT-X-ENDLIST", ""), base),
    /ENDLIST/,
  );
  assert.throws(
    () =>
      parseMediaPlaylist(
        MEDIA.replace(
          "#EXT-X-ENDLIST",
          "#EXT-X-MAP:URI=init.mp4\n#EXT-X-ENDLIST",
        ),
        base,
      ),
    /fMP4/,
  );
  assert.throws(
    () =>
      parseMediaPlaylist(
        MEDIA.replace(
          "#EXT-X-ENDLIST",
          "#EXT-X-KEY:METHOD=AES-128,URI=key\n#EXT-X-ENDLIST",
        ),
        base,
      ),
    /Encrypted source/,
  );
});

await test("parses separate audio tracks in HLS master playlists", () => {
  const master = parseMasterPlaylist(
    `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-1",NAME="English",DEFAULT=YES,URI="audio/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,AUDIO="audio-1"
360/index.m3u8
`,
    "https://example.com/course/master.m3u8",
  );
  assert.equal(master.variants.length, 1);
  assert.equal(master.audioTracks.length, 1);
  assert.equal(master.audioTracks[0]!.groupId, "audio-1");
  assert.equal(
    master.audioTracks[0]!.url,
    "https://example.com/course/audio/index.m3u8",
  );
});

await test("selects one variant per requested height, preferring H.264, falling back lower", () => {
  const master = parseMasterPlaylist(
    `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,CODECS="vp09.00.40.08"
720vp9.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360,CODECS="avc1.4d401e"
360.m3u8
`,
    "https://example.com/master.m3u8",
  );
  const selected = selectVariants(master, ["1080", "480"]);
  // 1080 is not offered → 720 (H.264, not the higher-bitrate VP9); 480 → 360.
  assert.deepEqual(
    selected.map((variant) => [variant.height, variant.uri]),
    [
      [360, "360.m3u8"],
      [720, "720.m3u8"],
    ],
  );
});

function startLadderServer(failFirstSegmentWith403: boolean) {
  const segmentHits = new Map<string, number>();
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/master.m3u8") return res.end(MASTER);
    if (url.endsWith("/index.m3u8")) return res.end(MEDIA);
    const match = url.match(/^\/(360|720)\/(seg-\d)\.ts$/);
    if (match) {
      const hits = (segmentHits.get(url) ?? 0) + 1;
      segmentHits.set(url, hits);
      if (failFirstSegmentWith403 && hits === 1) {
        res.statusCode = 403;
        return res.end();
      }
      return res.end(`${match[1]}-${match[2]}-bytes`);
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise<{
    base: string;
    close: () => Promise<void>;
    segmentHits: Map<string, number>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        base: `http://127.0.0.1:${port}`,
        segmentHits,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

await test("downloads a ladder, retries a transient 403, and reads it back aligned", async () => {
  const server = await startLadderServer(true);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-hls-"));
  try {
    const progress: number[] = [];
    const ladder = await downloadHlsLadder({
      manifestUrl: `${server.base}/master.m3u8`,
      outputDir: dir,
      qualities: ["720", "360"],
      workers: 2,
      attempts: 3,
      timeoutMs: 5_000,
      onSegment: ({ completed }) => progress.push(completed),
    });
    assert.deepEqual(ladder.qualities, ["360", "720"]);
    assert.equal(ladder.segmentCount, 2);
    assert.equal(ladder.durationSeconds, 7.5);
    assert.deepEqual(progress.sort(), [1, 2, 3, 4]);
    assert.equal(
      await fs.readFile(path.join(dir, "720", "segment_000002.ts"), "utf8"),
      "720-seg-2-bytes",
    );
    assert.equal(server.segmentHits.get("/360/seg-1.ts"), 2);

    const writtenMaster = await fs.readFile(
      path.join(dir, "master.m3u8"),
      "utf8",
    );
    assert.doesNotMatch(writtenMaster, /SUBTITLES=/);
    assert.match(writtenMaster, /^360\/360\.m3u8$/m);

    const local = await readLocalLadder(dir);
    assert.deepEqual(
      local.variants.map((variant) => variant.quality),
      ["360", "720"],
    );
    assert.equal(local.audio, null);
    assert.equal(
      local.variants[1]!.segments[0]!.file,
      path.join(dir, "720", "segment_000001.ts"),
    );

    // A second run reuses every downloaded segment.
    const before = server.segmentHits.get("/720/seg-2.ts");
    await downloadHlsLadder({
      manifestUrl: `${server.base}/master.m3u8`,
      outputDir: dir,
      qualities: ["720", "360"],
      workers: 2,
    });
    assert.equal(server.segmentHits.get("/720/seg-2.ts"), before);
  } finally {
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

await test("refuses a local ladder whose playlist points outside the folder", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-hls-"));
  try {
    await fs.writeFile(
      path.join(dir, "master.m3u8"),
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\n../evil.m3u8\n",
    );
    await assert.rejects(readLocalLadder(dir), /Unsafe local HLS/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
