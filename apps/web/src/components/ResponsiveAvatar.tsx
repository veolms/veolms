import type { AvatarImageVariant } from "@veolms/contracts";
import { useState, type ImgHTMLAttributes } from "react";

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

const ORIGINAL_EXTENSIONS = ["png", "jpg", "webp", "gif"] as const;
const AVATAR_VARIANT_URL_PATTERN =
  /^(.*\/public\/avatars\/[A-Za-z0-9_-]{1,200})\/(?:45|96|160)\.webp([?#].*)?$/u;

/**
 * One image contract for avatar consumers. The API's width descriptors are
 * converted here so every real avatar render uses the same src/srcSet rules.
 */
export function ResponsiveAvatar({
  src,
  srcSet,
  sizes,
  width,
  height,
  loading = "lazy",
  decoding = "async",
  onError,
  ...props
}: ResponsiveAvatarProps) {
  const responsiveSources = srcSet?.length
    ? srcSet.map((variant) => `${variant.url} ${variant.width}w`).join(", ")
    : undefined;
  const avatarMatch = src ? AVATAR_VARIANT_URL_PATTERN.exec(src) : null;
  const sourceKey = `${src ?? ""}\n${responsiveSources ?? ""}`;
  const [recovery, setRecovery] = useState({ sourceKey: "", step: 0 });
  const recoveryStep = recovery.sourceKey === sourceKey ? recovery.step : 0;
  const originalUrl =
    avatarMatch &&
    recoveryStep >= 2 &&
    recoveryStep < 2 + ORIGINAL_EXTENSIONS.length
      ? `${avatarMatch[1]}/original.${ORIGINAL_EXTENSIONS[recoveryStep - 2]}${avatarMatch[2] ?? ""}`
      : null;

  const handleError: NonNullable<
    ImgHTMLAttributes<HTMLImageElement>["onError"]
  > = (event) => {
    if (avatarMatch && recoveryStep === 0 && responsiveSources) {
      const selectedUrl = event.currentTarget.currentSrc;
      const primaryUrl = event.currentTarget.src;
      if (selectedUrl && primaryUrl && selectedUrl !== primaryUrl) {
        setRecovery({ sourceKey, step: 1 });
        return;
      }
    }

    if (avatarMatch && recoveryStep <= 1) {
      setRecovery({ sourceKey, step: 2 });
      return;
    }

    if (
      avatarMatch &&
      recoveryStep >= 2 &&
      recoveryStep < 1 + ORIGINAL_EXTENSIONS.length
    ) {
      setRecovery({ sourceKey, step: recoveryStep + 1 });
      return;
    }

    onError?.(event);
  };

  return (
    <img
      {...props}
      src={originalUrl ?? src ?? undefined}
      srcSet={recoveryStep === 0 ? responsiveSources : undefined}
      sizes={sizes}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  );
}
