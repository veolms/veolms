/**
 * Chunks of seek-preview videos kept on this device (Cache Storage), so a
 * part of a lesson's preview is downloaded once, not on every visit: they
 * survive reloads and restarts and are shared by every tab. A 4 h lesson's
 * whole preview is 14-66 MB; the download URL carries a playback token
 * that changes between visits, so the browser's own cache missed it.
 *
 * Entries are keyed by the preview file's URL without its query. Every
 * storyboard run writes to a folder of its own, so a regenerated preview
 * has a new URL and an old picture is never shown for it; opening a run
 * deletes the other runs kept for the same video. Which chunks of which run
 * are kept is listed in localStorage (one bit per chunk), so the player
 * knows what it has without reading the cache, and the least recently used
 * runs go first once the total passes `BUDGET_BYTES`. The browser may still
 * clear it all (low storage, Safari after 7 days without a visit, a private
 * window); it is then downloaded again.
 */

const CACHE_NAME = "veo-preview-chunks-v1";
const META_KEY = "veo-preview-chunks-v1";
const BUDGET_BYTES = 300 * 1024 * 1024;
/** The list is written at most this often while chunks arrive. */
const META_WRITE_DELAY_MS = 400;

interface RunMeta {
  /** The video's storyboard folder: runs of the same video share it. */
  folder: string;
  bytes: number;
  used: number;
  /** One bit per chunk kept, base64. */
  chunks: string;
}

type Meta = Record<string, RunMeta>;

function readMeta(): Meta {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(META_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Meta) : {};
  } catch {
    return {};
  }
}

function writeMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Full or blocked: the chunks are simply not found next time.
  }
}

function toBits(chunks: Iterable<number>, count: number): string {
  const bits = new Uint8Array(Math.ceil(count / 8));
  for (const chunk of chunks) bits[chunk >> 3]! |= 1 << (chunk & 7);
  let text = "";
  for (const byte of bits) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBits(encoded: string): number[] {
  try {
    const text = atob(encoded);
    const chunks: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
      const byte = text.charCodeAt(index);
      for (let bit = 0; bit < 8; bit += 1) {
        if (byte & (1 << bit)) chunks.push(index * 8 + bit);
      }
    }
    return chunks;
  } catch {
    return [];
  }
}

function chunkKey(run: string, chunk: number): string {
  return `${run}?chunk=${chunk}`;
}

function openCache(): Promise<Cache> | null {
  try {
    return typeof caches === "undefined" ? null : caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function deleteRun(
  cache: Promise<Cache>,
  run: string,
  meta: RunMeta,
): Promise<void> {
  const opened = await cache;
  await Promise.all(
    fromBits(meta.chunks).map((chunk) =>
      opened.delete(chunkKey(run, chunk)).catch(() => false),
    ),
  );
}

export class PreviewChunkCache {
  /** Chunks kept for this run, as listed when it was opened (and since). */
  readonly kept: Set<number>;
  readonly #run: string;
  readonly #folder: string;
  readonly #chunkCount: number;
  readonly #cache: Promise<Cache>;
  #bytes: number;
  #writeTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    run: string,
    folder: string,
    chunkCount: number,
    cache: Promise<Cache>,
  ) {
    this.#run = run;
    this.#folder = folder;
    this.#chunkCount = chunkCount;
    this.#cache = cache;
    const meta = readMeta();
    const own = meta[run];
    this.kept = new Set(
      own ? fromBits(own.chunks).filter((chunk) => chunk < chunkCount) : [],
    );
    this.#bytes = own?.bytes ?? 0;
    // Other runs of this video were made from an older version of it.
    let changed = false;
    for (const [other, entry] of Object.entries(meta)) {
      if (other === run || entry.folder !== folder) continue;
      void deleteRun(cache, other, entry).catch(() => undefined);
      delete meta[other];
      changed = true;
    }
    if (own) {
      own.used = Date.now();
      changed = true;
    }
    if (changed) writeMeta(meta);
  }

  /**
   * The cache for the preview file at `fileUrl` (`chunkCount` chunks), or
   * null where this browser keeps none (no Cache Storage: an insecure page,
   * some private windows).
   */
  static open(fileUrl: string, chunkCount: number): PreviewChunkCache | null {
    const cache = openCache();
    if (!cache) return null;
    let run: string;
    try {
      const url = new URL(fileUrl);
      run = `${url.origin}${url.pathname}`;
    } catch {
      return null;
    }
    const marker = run.lastIndexOf("/storyboard/");
    const folder = marker === -1 ? run : run.slice(0, marker);
    cache.catch(() => undefined);
    return new PreviewChunkCache(run, folder, chunkCount, cache);
  }

  /** The chunk's bytes, or null when it is not (or no longer) kept. */
  async get(chunk: number): Promise<Uint8Array | null> {
    try {
      const response = await (
        await this.#cache
      ).match(chunkKey(this.#run, chunk));
      if (response) return new Uint8Array(await response.arrayBuffer());
    } catch {
      // Read as missing.
    }
    // Cleared by the browser meanwhile: no longer counted as kept.
    if (this.kept.delete(chunk)) this.#scheduleWrite();
    return null;
  }

  put(chunk: number, bytes: Uint8Array): void {
    if (this.kept.has(chunk)) return;
    this.kept.add(chunk);
    this.#bytes += bytes.length;
    void this.#cache
      .then((cache) =>
        cache.put(
          chunkKey(this.#run, chunk),
          new Response(bytes.slice(), {
            headers: { "content-type": "application/octet-stream" },
          }),
        ),
      )
      .then(() => this.#scheduleWrite())
      .catch(() => {
        this.kept.delete(chunk);
      });
  }

  #scheduleWrite(): void {
    if (this.#writeTimer !== null) return;
    this.#writeTimer = setTimeout(() => {
      this.#writeTimer = null;
      this.#writeNow();
    }, META_WRITE_DELAY_MS);
  }

  #writeNow(): void {
    // Read again first: other tabs keep their own runs in the same list.
    const meta = readMeta();
    meta[this.#run] = {
      folder: this.#folder,
      bytes: this.#bytes,
      used: Date.now(),
      chunks: toBits(this.kept, this.#chunkCount),
    };
    let total = Object.values(meta).reduce(
      (sum, entry) => sum + (entry.bytes || 0),
      0,
    );
    const oldestFirst = Object.entries(meta)
      .filter(([run]) => run !== this.#run)
      .sort((left, right) => left[1].used - right[1].used);
    for (const [run, entry] of oldestFirst) {
      if (total <= BUDGET_BYTES) break;
      total -= entry.bytes || 0;
      void deleteRun(this.#cache, run, entry).catch(() => undefined);
      delete meta[run];
    }
    writeMeta(meta);
  }
}

/** What the seek previews kept on this device take up. */
export function getPreviewChunkCacheUsage(): { bytes: number; videos: number } {
  const runs = Object.values(readMeta());
  return {
    bytes: runs.reduce((sum, entry) => sum + (entry.bytes || 0), 0),
    videos: runs.length,
  };
}

/**
 * Empties the seek-preview cache. A preview open in another tab finds its
 * chunks gone and downloads them again.
 */
export async function clearPreviewChunkCache(): Promise<void> {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    // The list is read again, and found wrong, chunk by chunk.
  }
  try {
    if (typeof caches !== "undefined") await caches.delete(CACHE_NAME);
  } catch {
    // Left for the browser to clear.
  }
}
