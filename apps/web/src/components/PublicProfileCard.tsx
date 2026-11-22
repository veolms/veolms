import type { MouseEvent, ReactNode } from "react";

interface PublicProfileCardProps {
  displayName: string;
  username: string;
  avatar: ReactNode;
  bio?: string | null;
  links?: ReactNode;
  verifiedIcon?: ReactNode;
  /** A team member's title ("Lead Engineer"), as a badge under the name. */
  badge?: string | null;
  photoAction?: ReactNode;
  photoActions?: ReactNode;
  /** Makes the @username a link (the profile preview's, to the
   * full profile page). */
  /** Shown inside the card, under its content (the preview's link on to
   * the full profile page). */
  footer?: ReactNode;
  nameLink?: {
    href?: string;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  };
}

const NAME_LINK_CLASS =
  "rounded-sm text-inherit no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

/** Shared public profile presentation used by Profile Settings and public pages. */
export function PublicProfileCard({
  displayName,
  username,
  avatar,
  bio,
  links,
  verifiedIcon,
  badge,
  photoAction,
  photoActions,
  nameLink,
  footer,
}: PublicProfileCardProps) {
  const handle = nameLink ? (
    <a
      href={nameLink.href}
      onClick={nameLink.onClick}
      className={NAME_LINK_CLASS}
    >
      @{username}
    </a>
  ) : (
    `@${username}`
  );
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
        <p className="settings-profile__username">{handle}</p>
        {badge ? (
          <p className="m-0 mt-1.5 flex justify-center">
            <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
              {badge}
            </span>
          </p>
        ) : null}
        {bio ? <p className="settings-profile__bio">{bio}</p> : null}
        {links}
      </div>
      {footer}
    </div>
  );
}
