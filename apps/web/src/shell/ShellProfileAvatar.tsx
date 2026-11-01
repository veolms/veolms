import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useState } from "react";
import type { AvatarImageVariant } from "@veolms/contracts";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";

export const FALLBACK_AVATAR_CLASS =
  "shell-profile-avatar shell-profile-avatar--fallback";

/**
 * Behind a picture the disc is a dark one by night: the ground the sidebar
 * stands on, with a little of the accent in it. A picture with a clear
 * background (a drawing, a cut-out) otherwise stands on the same grey as
 * the button around it and has no disc at all. By day a dark disc would be
 * a hole in a light sidebar, so there it is a light tint of the accent.
 */
export const IMAGE_AVATAR_CLASS =
  "shell-profile-avatar bg-[color-mix(in_srgb,var(--accent)_12%,#181d29)]! [:root[data-theme=light]_&]:bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface-strong))]!";

/**
 * Lives apart from ProfileMenu so the always-visible shell avatar (sidebar
 * footer, mobile bottom nav) does not keep the whole profile menu module in
 * the startup bundle; the menu itself lazy-loads on idle or first open.
 */
export function ShellProfileAvatar({
  avatarUrl,
  avatarSrcSet,
}: {
  avatarUrl: string | null;
  avatarSrcSet?: readonly AvatarImageVariant[] | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(avatarUrl) && !imageFailed;
  const avatarSources = avatarSrcSet?.length ? avatarSrcSet : undefined;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl, avatarSources]);

  return (
    <i
      className={
        showImage && avatarUrl ? IMAGE_AVATAR_CLASS : FALLBACK_AVATAR_CLASS
      }
      aria-hidden="true"
    >
      {showImage && avatarUrl ? (
        <ResponsiveAvatar
          src={avatarUrl}
          srcSet={avatarSources}
          sizes="43px"
          alt=""
          width={43}
          height={43}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserCircle size={28} weight="duotone" />
      )}
    </i>
  );
}
