import type { AvatarImageVariant } from "@veolms/contracts";
import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";

type ResponsiveAvatarProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "sizes" | "width" | "height"
> & {
  src: string | null | undefined;
  srcSet?: readonly AvatarImageVariant[] | null;
  sizes: string;
  width: number;
  height: number;
};

const AVATAR_PREFIX_PATTERN =
  /^(.*\/public\/avatars\/[A-Za-z0-9_-]{1,200})(?:\/(?:(?:45|96|160)\.webp|original\.(?:jpg|jpeg|png|webp|gif)))?([?#].*)?$/u;

/**
 * The widths the CDN serves an avatar at. It answers 400 for any other, 96
 * included, which older API responses still list: a browser that picked it
 * showed nothing until it had fallen back to the original file.
 */
const CDN_AVATAR_WIDTHS: readonly number[] = [45, 160];

// Global in-memory cache to remember working original avatar URLs across component mounts
const resolvedAvatarCache = new Map<string, string>();

function getCandidateExtensions(prefix: string): readonly string[] {
  if (prefix.endsWith("--google")) {
    return ["original.jpg", "original.png", "original.webp"];
  }
  return ["original.png", "original.jpg", "original.webp"];
}

/**
 * One image contract for avatar consumers. The API's width descriptors are
 * converted here so every real avatar render uses the same src/srcSet rules,
 * with automatic fallback to original CDN files if WebP variants fail.
 */
export function ResponsiveAvatar({
  src,
  srcSet,
  sizes,
  width,
  height,
  loading = "lazy",
  decoding = "async",
  ...props
}: ResponsiveAvatarProps) {
  const match = useMemo(
    () => (src ? AVATAR_PREFIX_PATTERN.exec(src) : null),
    [src],
  );
  const avatarPrefix = match ? match[1] : null;
  const querySuffix = match && match[2] ? match[2] : "";

  const cachedUrl = avatarPrefix ? resolvedAvatarCache.get(avatarPrefix) : null;

  // Fallback candidate index: -1 means initial attempt
  const [candidateIndex, setCandidateIndex] = useState<number>(-1);
  const [useRawSrcOnly, setUseRawSrcOnly] = useState<boolean>(false);

  useEffect(() => {
    setCandidateIndex(-1);
    setUseRawSrcOnly(false);
  }, [src]);

  const candidates = useMemo(() => {
    if (!avatarPrefix) return [];
    return getCandidateExtensions(avatarPrefix);
  }, [avatarPrefix]);

  let activeSrc: string | undefined = src ?? undefined;
  const offered = srcSet?.filter(
    (variant) => !avatarPrefix || CDN_AVATAR_WIDTHS.includes(variant.width),
  );
  let activeSrcSet: string | undefined = offered?.length
    ? offered.map((variant) => `${variant.url} ${variant.width}w`).join(", ")
    : undefined;

  if (avatarPrefix) {
    if (cachedUrl) {
      activeSrc = cachedUrl;
      activeSrcSet = undefined;
    } else if (candidateIndex >= 0 && candidateIndex < candidates.length) {
      activeSrc = `${avatarPrefix}/${candidates[candidateIndex]}${querySuffix}`;
      activeSrcSet = undefined;
    } else if (src?.endsWith("--google/160.webp")) {
      // Direct optimization for Google avatars: avoid known 401 on 160.webp
      activeSrc = `${avatarPrefix}/original.jpg${querySuffix}`;
      activeSrcSet = undefined;
    } else if (
      !activeSrcSet &&
      !avatarPrefix.endsWith("--google") &&
      width <= 64
    ) {
      // Some API responses carry only the original file, which can be
      // hundreds of kilobytes for a small avatar slot. The CDN publishes
      // fixed-width WebP variants next to it, so offer those for small
      // slots (the largest variant is 160px, which cannot serve large
      // avatars sharply); a failed load falls back through the original
      // files via onError.
      activeSrcSet = CDN_AVATAR_WIDTHS.map(
        (variantWidth) =>
          `${avatarPrefix}/${variantWidth}.webp${querySuffix} ${variantWidth}w`,
      ).join(", ");
    }
  } else if (useRawSrcOnly) {
    activeSrcSet = undefined;
  }

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (
    event,
  ) => {
    if (avatarPrefix) {
      const nextIndex = candidateIndex + 1;
      if (nextIndex < candidates.length) {
        setCandidateIndex(nextIndex);
        return;
      }
    } else if (activeSrcSet && !useRawSrcOnly) {
      setUseRawSrcOnly(true);
      return;
    }
    props.onError?.(event);
  };

  const handleLoad: ImgHTMLAttributes<HTMLImageElement>["onLoad"] = (event) => {
    if (avatarPrefix && activeSrc && !activeSrcSet) {
      resolvedAvatarCache.set(avatarPrefix, activeSrc);
    }
    props.onLoad?.(event);
  };

  return (
    <img
      {...props}
      src={activeSrc}
      srcSet={activeSrcSet}
      sizes={sizes}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
