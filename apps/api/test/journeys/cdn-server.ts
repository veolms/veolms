/**
 * A stand-in for the CDN. Every lesson's video is the same 12-second test
 * video (./video, made in the shape the transcoder leaves real lessons in:
 * an HLS master playlist, a 360p playlist, init.mp4 and .m4s segments).
 *
 * Like the real CDN, it refuses a video segment asked for without the
 * playback token the API gave the player, so a video that plays in a test
 * proves the player sent it. (The real CDN also checks the token's
 * signature; that check lives with the CDN, not here.)
 *
 * It also remembers which videos were asked for, so a test can check that a
 * locked lesson downloaded nothing.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO_FOLDER = fileURLToPath(new URL("./video/", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".mp4": "video/mp4",
  ".m4s": "video/iso.segment",
};

export interface CdnRequest {
  /** The media id in the link (`/videos/<mediaId>/...`). */
  mediaId: string;
  file: string;
  status: number;
}

export function startCdnServer(port: number): Promise<{
  server: Server;
  requests: CdnRequest[];
}> {
  const requests: CdnRequest[] = [];

  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Headers", "*");
      response.writeHead(204).end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    // /videos/<mediaId>/<file>: the link the API builds from a lesson's
    // storage key (see createCourse in flow-courses.ts).
    const match = /^\/videos\/([^/]+)\/(.+)$/u.exec(url.pathname);
    if (!match) {
      response.writeHead(404).end();
      return;
    }
    const [, mediaId, file] = match as unknown as [string, string, string];
    const answer = (status: number) => {
      requests.push({ mediaId, file, status });
      return status;
    };

    const path = normalize(join(VIDEO_FOLDER, file));
    if (!path.startsWith(normalize(VIDEO_FOLDER)) || !existsSync(path)) {
      response.writeHead(answer(404)).end();
      return;
    }

    const isSegment = extname(path) === ".m4s";
    const token =
      url.searchParams.get("t") ?? url.searchParams.get("veo_token");
    if (isSegment && !token) {
      response.writeHead(answer(403)).end("A segment needs a playback token.");
      return;
    }

    response.writeHead(answer(200), {
      "Content-Type":
        CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
      "Content-Length": statSync(path).size,
    });
    createReadStream(path).pipe(response);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, requests }));
  });
}
