/**
 * Helpers for answering the HLS master playlist request from text the page
 * already holds (the playback bootstrap carries it), so playback starts one
 * round trip sooner.
 *
 * A playlist served from a `data:` URI has no base URL, so every relative
 * URI in it is first made absolute against the URL it was published at.
 */

const URI_ATTRIBUTE = /URI="([^"]*)"/gu;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/iu;
const HLS_PLAYLIST_DATA_URI_PREFIX =
  "data:application/vnd.apple.mpegurl;charset=utf-8,";

/** The query parameter the CDN reads a playback token from. */
export function playbackTokenQueryParameter(token: string): "t" | "veo_token" {
  return token.length === 40 ? "t" : "veo_token";
}

function resolvePlaylistUri(
  uri: string,
  manifestUrl: string,
  segmentToken: string | undefined,
): string {
  const trimmed = uri.trim();
  if (!trimmed) return uri;
  // skd:, data:, blob: and other non-HTTP URIs are identifiers, not paths.
  if (URI_SCHEME.test(trimmed) && !/^https?:/iu.test(trimmed)) return uri;
  let resolved: URL;
  try {
    resolved = new URL(trimmed, manifestUrl);
  } catch {
    return uri;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return uri;
  }
  if (segmentToken) {
    resolved.searchParams.set(
      playbackTokenQueryParameter(segmentToken),
      segmentToken,
    );
  }
  return resolved.toString();
}

/**
 * Rewrites a master playlist so every variant, rendition and I-frame URI is
 * absolute against `manifestUrl`, optionally carrying `segmentToken`. Tags
 * and their order are kept as they are.
 */
export function resolveInlinedMasterManifest(
  rawM3u8: string,
  manifestUrl: string,
  segmentToken?: string,
): string {
  return rawM3u8
    .split(/\r?\n/u)
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith("#")) {
        return line.includes('URI="')
          ? line.replace(
              URI_ATTRIBUTE,
              (_match, uri: string) =>
                `URI="${resolvePlaylistUri(uri, manifestUrl, segmentToken)}"`,
            )
          : line;
      }
      return resolvePlaylistUri(line, manifestUrl, segmentToken);
    })
    .join("\n");
}

/** Whether `text` looks like an HLS playlist that can be served inline. */
export function isInlinableHlsPlaylist(text: string | undefined): boolean {
  return typeof text === "string" && text.trimStart().startsWith("#EXTM3U");
}

/** A `data:` URI that Shaka's data scheme plugin reads as an HLS playlist. */
export function createHlsPlaylistDataUri(playlist: string): string {
  return `${HLS_PLAYLIST_DATA_URI_PREFIX}${encodeURIComponent(playlist)}`;
}

const MPD_OPENING_TAG = /<MPD\b[^>]*>/u;
// A BaseURL directly under <MPD>: one before the first <Period>.
const MPD_LEVEL_BASE_URL = /<BaseURL\b([^>]*)>([^<]*)<\/BaseURL>/u;

/** Whether `text` looks like a DASH MPD that can be served inline. */
export function isInlinableDashManifest(text: string | undefined): boolean {
  return typeof text === "string" && MPD_OPENING_TAG.test(text);
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function unescapeXmlText(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

/**
 * Gives an MPD an absolute MPD-level `<BaseURL>`, so that its segment
 * templates (`360/seg-p000-$Number%05d$.m4s`, `360/init-p000.m4s`) resolve
 * against the CDN rather than the `data:` URI it is served from. An existing
 * MPD-level BaseURL is resolved against `manifestUrl` in place; Period,
 * AdaptationSet and Representation BaseURLs then resolve against it as the
 * DASH spec says.
 */
export function resolveInlinedDashManifest(
  mpd: string,
  manifestUrl: string,
): string {
  const opening = MPD_OPENING_TAG.exec(mpd);
  if (!opening) return mpd;
  const bodyStart = opening.index + opening[0].length;
  const firstPeriod = mpd.indexOf("<Period", bodyStart);
  const head = mpd.slice(
    bodyStart,
    firstPeriod === -1 ? undefined : firstPeriod,
  );

  const existing = MPD_LEVEL_BASE_URL.exec(head);
  if (existing) {
    const absolute = new URL(
      unescapeXmlText((existing[2] ?? "").trim()),
      manifestUrl,
    ).toString();
    const start = bodyStart + existing.index;
    return `${mpd.slice(0, start)}<BaseURL${existing[1]}>${escapeXmlText(absolute)}</BaseURL>${mpd.slice(start + existing[0].length)}`;
  }

  const base = new URL(".", manifestUrl);
  base.search = "";
  base.hash = "";
  return `${mpd.slice(0, bodyStart)}\n  <BaseURL>${escapeXmlText(base.toString())}</BaseURL>${mpd.slice(bodyStart)}`;
}

/** A `data:` URI that Shaka's data scheme plugin reads as a DASH MPD. */
export function createDashManifestDataUri(mpd: string): string {
  return `data:application/dash+xml;charset=utf-8,${encodeURIComponent(mpd)}`;
}

/** Origin and path only: what identifies a manifest regardless of tokens. */
export function manifestIdentity(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}
