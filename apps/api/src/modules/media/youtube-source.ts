import type { MediaSource } from "@veolms/contracts";

/** YouTube's video ids: 11 characters of letters, digits, `-` and `_`. */
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** The hosts a YouTube video link may point at. */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/** The longest title kept; a longer one is cut (the editor truncates it). */
const MAX_TITLE_LENGTH = 300;

/** A `media_sources` row, as the repository reads it. */
export interface MediaSourceRow {
  provider: string;
  external_id: string;
  source_url: string;
  title: string | null;
  channel: string | null;
}

export function isYoutubeId(value: unknown): value is string {
  return typeof value === "string" && YOUTUBE_ID_PATTERN.test(value);
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * The link as given when it is an https YouTube address, otherwise null:
 * anything else (another site, `javascript:`, plain http) is not linked to.
 */
function safeYoutubeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.username || url.password) return null;
  return url.toString();
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function youtubeSource(
  id: string,
  url: unknown,
  title: unknown,
  channel: unknown,
): MediaSource {
  return {
    provider: "youtube",
    externalId: id,
    url: safeYoutubeUrl(url) ?? youtubeWatchUrl(id),
    title: cleanText(title),
    channel: cleanText(channel),
  };
}

/**
 * The YouTube video a video came from, read from everything that records
 * it, newest form first:
 *
 * 1. `media_assets.metadata.youtube` ({ id, url, title, playlistId,
 *    playlistTitle, index, mappedAt }): a lesson mapped to its YouTube
 *    video by hand or by script.
 * 2. The `media_sources` row the lesson editor's import and the playlist
 *    CLI write.
 * 3. `metadata.youtubeId` (with `sourceUrl` when there is one): what older
 *    imports kept.
 *
 * A form whose id is not a YouTube id is skipped; a link that is not an
 * https YouTube address is rebuilt from the id. A title missing from the
 * chosen form is taken from another that names the same video.
 */
export function resolveYoutubeSource(
  metadata: unknown,
  row: MediaSourceRow | null | undefined,
): MediaSource | null {
  const meta = asRecord(metadata);
  const mapped = asRecord(meta?.youtube);
  const fromRow =
    row && row.provider === "youtube" && isYoutubeId(row.external_id)
      ? youtubeSource(row.external_id, row.source_url, row.title, row.channel)
      : null;

  if (mapped && isYoutubeId(mapped.id)) {
    const source = youtubeSource(
      mapped.id,
      mapped.url,
      mapped.title,
      mapped.channel,
    );
    if (fromRow && fromRow.externalId === source.externalId) {
      return {
        ...source,
        title: source.title ?? fromRow.title,
        channel: source.channel ?? fromRow.channel,
      };
    }
    return source;
  }

  if (fromRow) return fromRow;

  if (meta && isYoutubeId(meta.youtubeId)) {
    return youtubeSource(meta.youtubeId, meta.sourceUrl, null, null);
  }

  return null;
}
