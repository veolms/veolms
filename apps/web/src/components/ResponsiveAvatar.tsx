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
  ...props
}: ResponsiveAvatarProps) {
  const responsiveSources = srcSet?.length
    ? srcSet.map((variant) => `${variant.url} ${variant.width}w`).join(", ")
    : undefined;
  const [failedResponsiveSource, setFailedResponsiveSource] = useState<
    string | null
  >(null);
  const useOriginalSource = Boolean(src && failedResponsiveSource === src);

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (
    event,
  ) => {
    // A CDN may not have every responsive variant ready yet. Retry the
    // canonical image before reporting a real avatar failure to the caller.
    if (responsiveSources && src && !useOriginalSource) {
      setFailedResponsiveSource(src);
      return;
    }
    props.onError?.(event);
  };

  return (
    <img
      {...props}
      src={src ?? undefined}
      srcSet={useOriginalSource ? undefined : responsiveSources}
      sizes={sizes}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  );
}
