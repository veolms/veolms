import type { AvatarImageVariant } from "@veolms/contracts";
import type { ImgHTMLAttributes } from "react";

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

  return (
    <img
      {...props}
      src={src ?? undefined}
      srcSet={responsiveSources}
      sizes={sizes}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
    />
  );
}
