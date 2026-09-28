import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useState } from "react";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";

interface DiscussionAvatarProps {
  src?: string | null;
  className: string;
  loading?: "eager" | "lazy";
  width?: number;
  height?: number;
}

export function DiscussionAvatar({
  src,
  className,
  loading = "eager",
  width = 44,
  height = 44,
}: DiscussionAvatarProps) {
  const normalizedSrc = src?.trim() ?? "";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedSrc]);

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas))] text-(--muted) ${className}`}
      aria-hidden="true"
    >
      {normalizedSrc && !imageFailed ? (
        <ResponsiveAvatar
          src={normalizedSrc}
          alt=""
          width={width}
          height={height}
          sizes={`${width}px`}
          loading={loading}
          decoding="async"
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserCircle className="size-[68%]" weight="duotone" />
      )}
    </span>
  );
}
