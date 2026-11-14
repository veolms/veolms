import {
  Fragment,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CSSProperties } from "react";
import { GuestProfileIcon } from "../icons/GuestProfileIcon";
import type { CourseRole } from "../courses/catalogue";
import { ShellProfileAvatar } from "./ShellProfileAvatar";
import {
  getNavigationDestination,
  getNavigationIconColor,
  type NavigationItem,
} from "./navigation";
import { leavesClickToBrowser, navigationHref } from "./navigationLink";
import { NavCountBadge } from "./NavCountBadge";
import type { NavigationItemWithMetadata } from "./navigation";
import type { SidebarPreferences } from "../settings/settingsPreferences";

export interface MobileBottomNavigationProps {
  mobileBottomNavRef: RefObject<HTMLElement | null>;
  mobileBottomNavHidden: boolean;
  effectiveRole: CourseRole;
  setMobileBottomNavHidden: Dispatch<SetStateAction<boolean>>;
  mobileNavigation: NavigationItem[];
  isNavigationItemActive: (item: NavigationItemWithMetadata) => boolean;
  sidebarPreferences: SidebarPreferences;
  selectNavigation: (label: string, item?: NavigationItemWithMetadata) => void;
  mobileMoreRef: RefObject<HTMLButtonElement | null>;
  mobileMoreActive: boolean;
  mobileMenuOpen: boolean;
  openMobileNavigationMenu: () => void;
  shellProfileAvatarUrl: string | null;
  shellProfileAvatarSrcSet: { url: string; width: number; height: number }[];
  isAuthenticated: boolean;
  unreadNotificationCount: number;
  /** Unread chat messages, shown on Chats. */
  unreadChatCount: number;
}

export function MobileBottomNavigation({
  mobileBottomNavRef,
  mobileBottomNavHidden,
  effectiveRole,
  setMobileBottomNavHidden,
  mobileNavigation,
  isNavigationItemActive,
  sidebarPreferences,
  selectNavigation,
  mobileMoreRef,
  mobileMoreActive,
  mobileMenuOpen,
  openMobileNavigationMenu,
  shellProfileAvatarUrl,
  shellProfileAvatarSrcSet,
  isAuthenticated,
  unreadNotificationCount,
  unreadChatCount,
}: MobileBottomNavigationProps) {
  // prettier-ignore
  return (
    <nav
      ref={mobileBottomNavRef}
      // By day the Discussions icon's green is taken a third of the way
      // to black: it all but vanished on a light bar. The other tones
      // read well as they are. When it is the active page its label,
      // which is the icon's colour, darkens with it. Both are marked
      // important: the bar's own stylesheet is not in a layer.
      className={`mobile-bottom-nav [:root[data-theme=light]_&>a[aria-label=Discussions].is-active]:text-[color-mix(in_srgb,var(--nav-icon-color)_66%,black)]! [:root[data-theme=light]_&>a[aria-label=Discussions]_svg]:text-[color-mix(in_srgb,var(--nav-icon-color)_66%,black)]! ${mobileBottomNavHidden ? "is-scroll-hidden" : ""}`}
      aria-label={`${effectiveRole === "creator" ? "Creator" : "Student"} mobile navigation`}
      onFocusCapture={() => setMobileBottomNavHidden(false)}
    >
      {mobileNavigation.map((item) => {
        const [label, Icon] = item;
        const active = isNavigationItemActive(item);
        const displayLabel = label;
        const badgeCount = label === "Chats" ? unreadChatCount : 0;
        const badgeId = `mobile-nav-${label.toLowerCase()}-count`;
        return (
          <Fragment key={label}>
            {/* A link, as the sidebar's items are (see SidebarNavigation). */}
            <a
              href={navigationHref(getNavigationDestination(item))}
              data-control-radius-surface=""
              className={active ? "is-active" : ""}
              style={
                {
                  "--nav-icon-color": getNavigationIconColor(
                    label,
                    sidebarPreferences,
                  ),
                } as CSSProperties
              }
              aria-current={active ? "page" : undefined}
              data-sidebar-swipe-ignore
              aria-label={displayLabel}
              aria-describedby={badgeCount > 0 ? badgeId : undefined}
              onClick={(event) => {
                if (leavesClickToBrowser(event)) return;
                event.preventDefault();
                selectNavigation(label, item);
              }}
            >
              <span className="relative">
                <Icon size={23} weight={active ? "fill" : "regular"} />
                <NavCountBadge
                  id={badgeId}
                  count={badgeCount}
                  unreadLabel="unread messages"
                  className="absolute top-0 right-0 h-4.5 min-w-4.5 translate-x-1/2 -translate-y-1/2 px-1 text-[0.625rem] shadow-[0_0_0_2px_var(--sidebar-background,var(--surface))]"
                />
              </span>
              <small>{displayLabel}</small>
            </a>
          </Fragment>
        );
      })}
      <button
        id="mobile-navigation-trigger"
        ref={mobileMoreRef}
        type="button"
        className={mobileMoreActive || mobileMenuOpen ? "is-active" : ""}
        // Starts with the word on the button ("You"), so the spoken
        // name contains the visible one.
        aria-label="You: open navigation and appearance menu"
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-navigation-sheet"
        onClick={openMobileNavigationMenu}
      >
        <span>
          <span className="mobile-bottom-nav__profile-avatar">
            {shellProfileAvatarUrl ? (
              <ShellProfileAvatar
                avatarUrl={shellProfileAvatarUrl}
                avatarSrcSet={shellProfileAvatarSrcSet}
              />
            ) : (
              // Laid out as a block filling the 24px box: left inline, the
              // SVG would sit on the text baseline and hang a little low.
              <GuestProfileIcon
                size={24}
                ringWidth={16}
                className="block size-full !text-(--accent)"
                aria-hidden="true"
              />
            )}
            {isAuthenticated && unreadNotificationCount > 0 ? (
              <i className="courses-profile__presence" aria-hidden="true" />
            ) : null}
          </span>
        </span>
        <small>You</small>
      </button>
    </nav>
  );
}
