import { useRef, useState, type ImgHTMLAttributes } from "react";

import { chatService } from "../services/chat";
import { useChatPhotoSource } from "./useChatMediaSource";

/** A copy of `url` the browser has not cached (a fresh signed link). */
function fresh(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}`;
}

/**
 * A chat photo, from this device when it was opened before (kept by
 * chat/chatMediaSource.ts), otherwise downloaded once and kept. When the
 * device's copy can't be used it loads the usual way, and once more with a
 * fresh link when that fails: a link the browser kept from earlier can
 * have expired, or the file was still arriving at storage. This browser's
 * own copies of a file being sent (blob:) are shown as they are.
 */
export function ChatImage({
  src,
  onError,
  loading,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const element = useRef<HTMLImageElement>(null);
  const media = useChatPhotoSource(src, loading === "lazy", element);
  // The address that was retried (once per address) and the fresh copy.
  const [retry, setRetry] = useState<{ for: string; url: string | null }>({
    for: "",
    url: null,
  });
  const retried = retry.for === src;
  const shown = media.local
    ? media.src
    : retried && retry.url
      ? retry.url
      : media.src;
  return (
    <img
      {...props}
      ref={element}
      loading={loading}
      src={shown}
      onError={(event) => {
        if (media.local) {
          media.fallBack();
          return;
        }
        // A CDN link that stopped working: through the API (a fresh link).
        const fallback = retried ? null : chatService.fileFallbackUrl(src);
        if (fallback) {
          setRetry({ for: src, url: fallback });
          return;
        }
        if (!retried && !src.startsWith("blob:")) {
          setRetry({ for: src, url: null });
          setTimeout(() => setRetry({ for: src, url: fresh(src) }), 600);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
