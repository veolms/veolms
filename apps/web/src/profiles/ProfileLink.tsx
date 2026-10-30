import {
  createContext,
  useContext,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isValidPublicProfileUsername } from "@veolms/contracts/username-rules";
import type { NavigateTo } from "../routing/navigation";
import { toggleProfilePreview } from "./profilePreviewStore";

/**
 * The app's own navigation, so a profile opened from a name or a picture
 * goes through it: the page it was opened from is remembered, and the
 * profile's back button returns there (a lesson included).
 */
export const ProfileNavigationContext = createContext<NavigateTo | null>(null);

export const ProfileNavigationProvider = ProfileNavigationContext.Provider;

/** A member's profile address, or null when they have none to open. */
export function getPublicProfilePath(
  username: string | null | undefined,
): string | null {
  const name = username?.trim().replace(/^@+/, "") ?? "";
  return isValidPublicProfileUsername(name)
    ? `/${encodeURIComponent(name)}`
    : null;
}

const PROFILE_LINK_CLASSES = {
  // The name is the link that is read out and reached with Tab.
  name: "rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
  // The picture beside it leads to the same place, for the pointer only.
  picture: "h-fit shrink-0 rounded-full",
} as const;

interface ProfileLinkProps {
  username: string | null | undefined;
  variant: keyof typeof PROFILE_LINK_CLASSES;
  className?: string;
  children: ReactNode;
}

/**
 * A name or picture that opens the member's profile preview. Without a profile
 * address (a removed account, a post still being sent) it is shown as it is.
 */
export function ProfileLink({
  username,
  variant,
  className = "",
  children,
}: ProfileLinkProps) {
  const navigateTo = useContext(ProfileNavigationContext);
  const profilePath = getPublicProfilePath(username);
  if (!profilePath) return <>{children}</>;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // The cards around these links open threads and replies on a click.
    event.stopPropagation();
    if (
      !navigateTo ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    // A click shows the member's profile over the page (a side pop-up, a
    // sheet on a phone); its picture there opens the full page.
    toggleProfilePreview(username ?? "", event.currentTarget);
  };

  const picture = variant === "picture";
  return (
    <a
      href={profilePath}
      aria-hidden={picture || undefined}
      tabIndex={picture ? -1 : undefined}
      className={`${PROFILE_LINK_CLASSES[variant]} ${className}`}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
