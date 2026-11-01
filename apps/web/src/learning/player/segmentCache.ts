import { onShakaRuntimeLoaded } from "@veolms/video-player/shaka-runtime-hooks";

/**
 * Lesson video segments kept in the browser, so a reload (or a return to a
 * lesson) plays what was already downloaded without asking the CDN again.
 *
 * The CDN lets the browser keep a segment for a year, but each page load is
 * given a new playback token and the token is part of every segment's
 * address (`?t=…`), so after a reload no address matched what the browser
 * held, and every segment was downloaded again. Here segments are kept in
 * the page's Cache Storage under their address without the token.
 *
 * It is done inside Shaka's fetch plugin, which every player's segment
 * requests go through (an extension's scheme plugin, such as the DRM one,
 * wraps the same function, which is why this runs before other runtime
 * hooks): a segment that is kept is answered from the cache, marked as such
 * so that it does not count towards the bandwidth estimate; any other is
 * fetched as before and kept. Answering from a scheme of our own does not
 * work: Shaka picks the plugin from the address before the request filters
 * run.
 *
 * The segments are encrypted (the keys come only with a licence), and the
 * same for everyone, so they are not tied to an account. At most
 * `MAX_CACHED_BYTES` are kept; the least recently used go first.
 */

const CACHE_NAME = "veolms-video-segments-v1";
const INDEX_KEY = "veolms-video-segments-index";
const MAX_CACHED_BYTES = 300 * 1024 * 1024;
/** Query parameters that carry the playback token. */
const TOKEN_PARAMETERS = ["t", "veo_token"];
/** `shaka.net.NetworkingEngine.RequestType.SEGMENT`. */
const SEGMENT_REQUEST = 1;

const available = () =>
  typeof window !== "undefined" &&
  typeof window.caches !== "undefined" &&
  window.isSecureContext;

let cachePromise: Promise<Cache> | null = null;
const openCache = () => (cachePromise ??= window.caches.open(CACHE_NAME));

/** A segment's address without its token, or null when it is not one. */
function segmentCacheKey(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const name of TOKEN_PARAMETERS) url.searchParams.delete(name);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Which segments are kept, their sizes and when each was last used. */
type SegmentIndex = Record<string, [bytes: number, usedAt: number]>;

function readIndex(): SegmentIndex {
  try {
    const index: unknown = JSON.parse(
      localStorage.getItem(INDEX_KEY) ?? "null",
    );
    return index && typeof index === "object" ? (index as SegmentIndex) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: SegmentIndex) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // The cache is still used; only its size is not kept in check.
  }
}

/** Drops the least recently used segments past the budget. */
async function trim(index: SegmentIndex) {
  let total = 0;
  for (const [bytes] of Object.values(index)) total += bytes;
  if (total <= MAX_CACHED_BYTES) return;
  const cache = await openCache();
  const oldestFirst = Object.entries(index).sort((a, b) => a[1][1] - b[1][1]);
  for (const [key, [bytes]] of oldestFirst) {
    if (total <= MAX_CACHED_BYTES) break;
    delete index[key];
    total -= bytes;
    void cache.delete(key);
  }
}

/** A kept segment's body, or null. */
async function readSegment(key: string): Promise<ArrayBuffer | null> {
  try {
    const hit = await (await openCache()).match(key);
    if (!hit) return null;
    const data = await hit.arrayBuffer();
    const index = readIndex();
    const entry = index[key];
    if (entry) {
      entry[1] = Date.now();
      writeIndex(index);
    }
    return data;
  } catch {
    return null;
  }
}

/** Keeps a segment just received from the network. */
function keepSegment(key: string, data: ArrayBuffer | ArrayBufferView) {
  const bytes = data.byteLength;
  if (!bytes) return;
  // The body is copied here, before the player goes on with its own.
  const body = new Response(data as BodyInit, {
    headers: { "content-type": "application/octet-stream" },
  });
  void openCache()
    .then((cache) => cache.put(key, body))
    .then(() => {
      const index = readIndex();
      index[key] = [bytes, Date.now()];
      return trim(index).then(() => writeIndex(index));
    })
    .catch(() => undefined);
}

interface ShakaRequestLike {
  method?: string;
  headers?: Record<string, string>;
}

interface ShakaResponseLike {
  uri: string;
  data: ArrayBuffer | ArrayBufferView;
  status?: number;
  fromCache?: boolean;
}

interface AbortableOperationLike {
  chain: (
    onSuccess: (value: unknown) => unknown,
    onError?: (error: unknown) => unknown,
  ) => AbortableOperationLike;
}

type SchemePlugin = ((
  uri: string,
  request: ShakaRequestLike,
  requestType: number,
  ...rest: unknown[]
) => AbortableOperationLike) & { __veoSegmentCache?: boolean };

interface ShakaNamespaceLike {
  net?: {
    HttpFetchPlugin?: {
      parse?: SchemePlugin;
      isSupported?: () => boolean;
    };
    NetworkingEngine?: {
      registerScheme?: (
        scheme: string,
        plugin: SchemePlugin,
        priority?: number,
        progressSupport?: boolean,
      ) => void;
      PluginPriority?: { PREFERRED?: number };
    };
  };
  util?: {
    AbortableOperation?: {
      notAbortable?: (promise: Promise<unknown>) => AbortableOperationLike;
    };
  };
}

function wrapFetchPlugin(shaka: ShakaNamespaceLike) {
  const fetchPlugin = shaka.net?.HttpFetchPlugin;
  const base = fetchPlugin?.parse;
  const AbortableOperation = shaka.util?.AbortableOperation;
  const notAbortable = AbortableOperation?.notAbortable;
  if (!fetchPlugin || !base || base.__veoSegmentCache || !notAbortable) {
    return;
  }
  const fetchAndKeep = (
    key: string | null,
    args: Parameters<SchemePlugin>,
  ): AbortableOperationLike => {
    const operation = base(...args);
    if (!key) return operation;
    return operation.chain((value) => {
      const response = value as ShakaResponseLike;
      if (
        !response.fromCache &&
        (response.status === undefined || response.status === 200)
      ) {
        keepSegment(key, response.data);
      }
      return response;
    });
  };
  const plugin: SchemePlugin = (...args) => {
    const [uri, request, requestType] = args;
    const isSegment =
      requestType === SEGMENT_REQUEST &&
      (request.method ?? "GET") === "GET" &&
      !Object.keys(request.headers ?? {}).some((name) => /^range$/i.test(name));
    const key = isSegment ? segmentCacheKey(uri) : null;
    if (!key) return base(...args);
    // Looked up first; a segment that is not there, or cannot be read, is
    // fetched as before. Only the network request can be aborted.
    return notAbortable
      .call(AbortableOperation, readSegment(key))
      .chain((data) =>
        data
          ? {
              uri,
              originalUri: uri,
              originalRequest: request,
              data,
              headers: {},
              status: 200,
              fromCache: true,
              timeMs: 0,
            }
          : fetchAndKeep(key, args),
      );
  };
  plugin.__veoSegmentCache = true;
  fetchPlugin.parse = plugin;
  // Shaka registered the original for http and https when it loaded; this
  // takes its place, at the same priority. An extension that registers its
  // own plugin over it calls `HttpFetchPlugin.parse`, which is this now.
  const engine = shaka.net?.NetworkingEngine;
  const priority = engine?.PluginPriority?.PREFERRED ?? 2;
  if (fetchPlugin.isSupported?.() ?? true) {
    for (const scheme of ["http", "https"]) {
      engine?.registerScheme?.(scheme, plugin, priority, true);
    }
  }
}

let installed = false;

/**
 * Keeps lesson video segments from now on (see above). Called before the
 * Shaka runtime is loaded; safe to call often.
 */
export function installSegmentCache() {
  if (installed || !available()) return;
  installed = true;
  onShakaRuntimeLoaded(
    (runtimeModule) => {
      const record = runtimeModule as { default?: unknown } | null;
      wrapFetchPlugin((record?.default ?? record) as ShakaNamespaceLike);
    },
    { first: true },
  );
}
