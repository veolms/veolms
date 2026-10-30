import type { AvatarImageVariant } from "@veolms/contracts";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useState } from "react";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";

interface DiscussionAvatarProps {
  src?: string | null;
  srcSet?: readonly AvatarImageVariant[] | null;
  className: string;
  loading?: "eager" | "lazy";
  width?: number;
  height?: number;
  /**
   * The signed-in viewer's own avatar (or a guest's), as in a composer: with
   * no picture it is drawn like the profile button in the sidebar, in the
   * theme's accent, rather than in the grey of other people's.
   */
  viewer?: boolean;
}

/** Other people's avatars: grey behind a missing picture. */
const PERSON_AVATAR_CLASSES =
  "border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas))] text-(--muted)";

/** The sidebar's profile button without a picture (`.shell-profile-avatar--fallback`). */
const VIEWER_FALLBACK_CLASSES =
  "border-[color-mix(in_srgb,var(--accent)_26%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface-strong))] text-(--accent-ink,var(--accent)) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_8%,transparent)]";

export function DiscussionAvatar({
  src,
  srcSet,
  className,
  loading = "eager",
  width = 44,
  height = 44,
  viewer = false,
}: DiscussionAvatarProps) {
  const normalizedSrc = src?.trim() ?? "";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedSrc]);

  const showsPicture = Boolean(normalizedSrc) && !imageFailed;

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border ${viewer && !showsPicture ? VIEWER_FALLBACK_CLASSES : PERSON_AVATAR_CLASSES} ${className}`}
      aria-hidden="true"
    >
      {showsPicture ? (
        <ResponsiveAvatar
          src={normalizedSrc}
          srcSet={srcSet}
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
