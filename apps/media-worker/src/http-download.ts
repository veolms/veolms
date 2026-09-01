import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export interface DownloadLimitOptions {
  maxBytes: number;
  signal?: AbortSignal;
}

export interface HttpDownloadOptions extends DownloadLimitOptions {
  timeoutMs: number;
}

export async function downloadHttpFile(
  url: string,
  localDestinationPath: string,
  options: HttpDownloadOptions,
): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  timeout.unref();

  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download video from ${url}: HTTP ${response.status}`,
      );
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > options.maxBytes) {
      throw new Error(
        `Video download from ${url} exceeds the ${options.maxBytes}-byte limit`,
      );
    }

    let downloadedBytes = 0;
    const limitStream = new Transform({
      transform(chunk: Buffer | Uint8Array, _encoding, callback) {
        downloadedBytes += chunk.byteLength;
        if (downloadedBytes > options.maxBytes) {
          callback(
            new Error(
              `Video download from ${url} exceeds the ${options.maxBytes}-byte limit`,
            ),
          );
          return;
        }
        callback(null, chunk);
      },
    });

    const webStream =
      response.body as unknown as NodeReadableStream<Uint8Array>;
    await pipeline(
      Readable.fromWeb(webStream),
      limitStream,
      createWriteStream(localDestinationPath),
    );
  } catch (error) {
    if (timedOut) {
      throw new Error(`Timed out downloading video from ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
