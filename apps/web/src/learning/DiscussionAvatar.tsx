import { useState, useEffect } from "react";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas))] text-(--muted) ${className}`}
      aria-hidden="true"
    >
      {src && !failed ? (
        <ResponsiveAvatar
          src={src}
          alt=""
          width={width}
          height={height}
          sizes={`${width}px`}
          loading={loading}
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <UserCircle className="size-[68%]" weight="duotone" />
      )}
    </span>
  );
}
