import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useState } from "react";
import type { AvatarImageVariant } from "@veolms/contracts";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";

const FALLBACK_AVATAR_CLASS =
  "shell-profile-avatar shell-profile-avatar--fallback";

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
        showImage && avatarUrl ? "shell-profile-avatar" : FALLBACK_AVATAR_CLASS
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
