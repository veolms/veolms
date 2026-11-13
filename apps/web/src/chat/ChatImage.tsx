import { useEffect, useState, type ImgHTMLAttributes } from "react";

/** A copy of `url` the browser has not cached (a fresh signed link). */
function fresh(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}`;
}

/**
 * A chat photo that loads again once, with a fresh link, when it fails:
 * a link the browser kept from earlier can have expired, or the file was
 * still arriving at storage. This browser's own copies (blob:) are shown
 * as they are.
 */
export function ChatImage({
  src,
  onError,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const [shown, setShown] = useState(src);
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    setShown(src);
    setRetried(false);
  }, [src]);
  return (
    <img
      {...props}
      src={shown}
      onError={(event) => {
        if (!retried && !src.startsWith("blob:")) {
          setRetried(true);
          setTimeout(() => setShown(fresh(src)), 600);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
