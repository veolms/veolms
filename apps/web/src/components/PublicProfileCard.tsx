import type { ReactNode } from "react";

interface PublicProfileCardProps {
  displayName: string;
  username: string;
  avatar: ReactNode;
  bio?: string | null;
  links?: ReactNode;
  verifiedIcon?: ReactNode;
  photoAction?: ReactNode;
  photoActions?: ReactNode;
}

/** Shared public profile presentation used by Profile Settings and public pages. */
export function PublicProfileCard({
  displayName,
  username,
  avatar,
  bio,
  links,
  verifiedIcon,
  photoAction,
  photoActions,
}: PublicProfileCardProps) {
  return (
    <div className="settings-profile__public-card">
      <div className="settings-profile__public-art" aria-hidden="true" />
      <div className="settings-profile__public-content">
        <div className="settings-profile__photo">
          {avatar}
          {photoAction}
        </div>
        {photoActions}
        <h3>
          {displayName} {verifiedIcon}
        </h3>
        <p className="settings-profile__username">@{username}</p>
        {bio ? <p className="settings-profile__bio">{bio}</p> : null}
        {links}
      </div>
    </div>
  );
}
