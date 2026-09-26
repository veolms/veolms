const CDN_URL = import.meta.env.VITE_CDN_URL || "/cdn";

export function getVideoPlaybackCdnOrigin(): string | null {
  try {
    const url = new URL(CDN_URL, "http://veolms.local");
    return /^https?:$/i.test(url.protocol) &&
      url.origin !== "http://veolms.local"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
