import type { Dispatch, SetStateAction } from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import type { CourseRole } from "../courses/catalogue";
import { ShellProfileAvatar } from "./ShellProfileAvatar";
import { EarlyProfileButtons } from "./EarlyProfileButtons";
import type { AuthIdentityHint } from "../store/auth.store";
import { hasAdminRole } from "./workspaceRole";
import type { NavigateTo } from "../routing/navigation";
import { SIDEBAR_PROFILE_BUTTON_CLASS } from "./academyShellClasses";
import { LoginProfileButton } from "./LoginProfileButton";
import type { Icon } from "@phosphor-icons/react";

export interface SidebarProfileButtonProps {
  isAuthenticated: boolean;
  shellProfileDisplayName: string;
  shellProfileSubtitle: string;
  profileMenu: boolean;
  profileMenuSurfaceMounted: boolean;
  setProfileMenuSurfaceMounted: Dispatch<SetStateAction<boolean>>;
  setPendingProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  shellProfileAvatarUrl: string | null;
  shellProfileAvatarSrcSet: { url: string; width: number; height: number }[];
  unreadNotificationCount: number;
  canSwitchWorkspace: boolean;
  ProfileSubtitleIcon: Icon;
  effectiveRole: CourseRole;
  userRoles: readonly string[] | undefined;
  accountStatusUnknown: boolean;
  authUserFetched: boolean;
  authIdentityHint: AuthIdentityHint | null;
  onNavigatePage: NavigateTo;
}

export function SidebarProfileButton({
  isAuthenticated,
  shellProfileDisplayName,
  shellProfileSubtitle,
  profileMenu,
  profileMenuSurfaceMounted,
  setProfileMenuSurfaceMounted,
  setPendingProfileMenuOpen,
  setProfileMenu,
  shellProfileAvatarUrl,
  shellProfileAvatarSrcSet,
  unreadNotificationCount,
  canSwitchWorkspace,
  ProfileSubtitleIcon,
  effectiveRole,
  userRoles,
  accountStatusUnknown,
  authUserFetched,
  authIdentityHint,
  onNavigatePage,
}: SidebarProfileButtonProps) {
  // prettier-ignore
  return (
    <>
      {isAuthenticated ? (
        <button
          type="button"
          className={SIDEBAR_PROFILE_BUTTON_CLASS}
          aria-label={`${shellProfileDisplayName}, ${shellProfileSubtitle}. Open profile menu`}
          aria-expanded={profileMenu}
          aria-controls="desktop-profile-menu"
          onClick={() => {
            if (!profileMenuSurfaceMounted) {
              // Mount the lazy menu closed first; the pending-open
              // effect opens it a frame later so this click cannot
              // race the menu's dismiss listeners.
              setProfileMenuSurfaceMounted(true);
              setPendingProfileMenuOpen(true);
              return;
            }
            setProfileMenu((current) => !current);
          }}
        >
          <span className="courses-profile__avatar-wrap">
            <ShellProfileAvatar
              avatarUrl={shellProfileAvatarUrl}
              avatarSrcSet={shellProfileAvatarSrcSet}
            />
            {unreadNotificationCount > 0 ? (
              <i
                className="courses-profile__presence"
                aria-label={`${unreadNotificationCount} unread notifications`}
              />
            ) : null}
          </span>
          <span>
            {/* A box of its own, as wide as the room there is: a
                        name too long for it ends in an ellipsis. Left as
                        inline text it was cut off mid-letter by the box
                        around it. */}
            <strong className="block truncate">
              {shellProfileDisplayName}
            </strong>
            {/* A role label sits slightly lower than a username. */}
            <small
              className={
                shellProfileSubtitle.startsWith("@")
                  ? undefined
                  : "mt-0.5!"
              }
            >
              {shellProfileSubtitle}
              {canSwitchWorkspace ? (
                <ProfileSubtitleIcon
                  className={`courses-profile__role-icon courses-profile__role-icon--${effectiveRole === "student" ? "student" : hasAdminRole(userRoles) ? "admin" : "creator"}`}
                  size={15}
                  weight="duotone"
                  aria-hidden="true"
                />
              ) : null}
            </small>
          </span>
          <CaretDown
            size={19}
            aria-hidden="true"
            className={
              profileMenu
                ? "courses-profile__caret is-open"
                : "courses-profile__caret"
            }
          />
        </button>
      ) : !authUserFetched ? (
        // Until the session check answers: "Login", the remembered
        // account's button, or a placeholder, picked by the document's head
        // before the first paint (see EarlyProfileButtons).
        <EarlyProfileButtons
          className={SIDEBAR_PROFILE_BUTTON_CLASS}
          arrowSize={16}
          onLogin={() => onNavigatePage("/login")}
        />
      ) : (
        <LoginProfileButton
          className={SIDEBAR_PROFILE_BUTTON_CLASS}
          arrowSize={16}
          onLogin={() => onNavigatePage("/login")}
        />
      )}
    </>
  );
}
