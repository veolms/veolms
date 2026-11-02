import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { ShellProfileAvatar } from "./ShellProfileAvatar";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { AvatarImageVariant } from "@veolms/contracts";
import { isValidPublicProfileUsername } from "@veolms/contracts/username-rules";
import type { CourseRole } from "../courses/catalogue";
import { getRoleDisplayName, hasAdminRole } from "./workspaceRole";
import { useWebContributions } from "../lib/web-contributions";

export interface ProfileIdentityData {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarSrcSet?: readonly AvatarImageVariant[] | null;
}

interface ProfileMenuIdentityProps extends ProfileIdentityData {
  variant?: "menu" | "mobile";
  unreadNotificationCount?: number;
  onNavigate: (path: string) => void;
  onClose?: () => void;
}

export function ProfileMenuIdentity({
  displayName,
  username,
  avatarUrl,
  avatarSrcSet,
  variant = "menu",
  unreadNotificationCount = 0,
  onNavigate,
  onClose,
}: ProfileMenuIdentityProps) {
  // A username that cannot be a profile address (an old account's, shorter
  // than a profile address allows) has no profile page to open. The link
  // goes to the profile settings instead, where a line under the username
  // field says why and lets them choose another.
  const profilePath = isValidPublicProfileUsername(username)
    ? `/${encodeURIComponent(username)}`
    : "/settings/profile";
  const handleProfileClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      onClose?.();
      return;
    }
    event.preventDefault();
    onNavigate(profilePath);
  };
  const mobile = variant === "mobile";

  return (
    <div
      className="courses-profile__button profile-menu__identity bg-[color-mix(in_srgb,var(--surface-strong)_94%,white_6%)]!"
      role="group"
      aria-label="Your profile"
    >
      <a
        className="profile-menu__identity-link absolute inset-0 z-0 flex min-w-0 items-center gap-1 rounded-[inherit] pl-0.5 pr-2 py-1 text-inherit no-underline outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,white_10%)]! focus-visible:ring-2 focus-visible:ring-(--accent)"
        href={profilePath}
        aria-label={`Open ${displayName}'s public profile`}
        role={mobile ? undefined : "menuitem"}
        onClick={handleProfileClick}
      >
        <span className="courses-profile__avatar-wrap">
          <ShellProfileAvatar
            avatarUrl={avatarUrl}
            avatarSrcSet={avatarSrcSet}
          />
          {unreadNotificationCount > 0 ? (
            <i
              className="courses-profile__presence"
              aria-label={`${unreadNotificationCount} unread notifications`}
            />
          ) : null}
        </span>
        <span className="profile-menu__identity-copy grid min-w-0 gap-0.5 text-left">
          <strong className="truncate text-[0.84rem] font-semibold text-(--text)">
            {displayName}
          </strong>
          <small className="truncate text-[0.72rem] text-(--muted)">
            @{username}
          </small>
        </span>
      </a>
      <button
        type="button"
        className="profile-menu__identity-edit group absolute right-1.5 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_84%,black_16%)]! p-0 text-(--muted) outline-none transition-colors hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        aria-label="Edit profile"
        title="Edit profile"
        role={mobile ? undefined : "menuitem"}
        onClick={() => onNavigate("/settings/profile")}
      >
        <PencilSimple
          className="group-hover:hidden group-focus-visible:hidden"
          size={18}
          weight="regular"
          aria-hidden="true"
        />
        <PencilSimple
          className="hidden group-hover:block group-focus-visible:block"
          size={18}
          weight="fill"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export { ShellProfileAvatar };

interface ProfileMenuProps {
  role: CourseRole;
  allowedRoles: readonly CourseRole[];
  userRoles?: readonly string[] | null;
  unreadNotificationCount?: number;
  sidebarHidden?: boolean;
  includeSidebarControl?: boolean;
  beforeAccountContent?: ReactNode;
  identity?: ProfileIdentityData;
  isOpen?: boolean;
  id?: string;
  className?: string;
  onClose: () => void;
  onRoleChange: (role: CourseRole) => void;
  onNavigate: (path: string) => void;
  onToggleSidebar?: () => void;
  onLogout: () => void;
}

/** How long the closing slide takes (`profile-menu-slide-shut`). */
const PROFILE_MENU_SHUT_MS = 260;

/** The settings menu's mark for the page that is open (courses.css). */
const currentPageItemClasses =
  "aria-[current=page]:text-(--text) aria-[current=page]:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface-strong))]! aria-[current=page]:hover:bg-[color-mix(in_srgb,var(--accent)_30%,var(--surface-strong))]!";

export function ProfileMenu({
  role,
  allowedRoles,
  userRoles,
  unreadNotificationCount = 0,
  sidebarHidden = false,
  includeSidebarControl = true,
  beforeAccountContent,
  identity,
  isOpen = true,
  id,
  className,
  onClose,
  onRoleChange,
  onNavigate,
  onToggleSidebar,
  onLogout,
}: ProfileMenuProps) {
  // The closing slide is played by a menu marked as having been open. The
  // mark comes off once that slide is over: left on, the slide played again
  // every time the sidebar was expanded, since the collapsed sidebar turns
  // the animation off and expanding it turns it back on.
  const [hasOpened, setHasOpened] = useState(false);
  if (isOpen && !hasOpened) setHasOpened(true);
  // The page the learner is on is marked in the menu, as the settings menu
  // marks its tab.
  const { pathname } = useLocation();
  const isCurrentPage = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);
  useEffect(() => {
    if (isOpen || !hasOpened) return undefined;
    const timer = window.setTimeout(
      () => setHasOpened(false),
      PROFILE_MENU_SHUT_MS + 60,
    );
    return () => window.clearTimeout(timer);
  }, [hasOpened, isOpen]);
  const selectRole = (nextRole: CourseRole) => {
    onRoleChange(nextRole);
    onClose();
  };
  const openDestination = (
    event: MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      onClose();
      return;
    }
    event.preventDefault();
    onNavigate(path);
  };

  // Links plugins add to the account section (see web-core contributions).
  const isAdmin = hasAdminRole(userRoles);
  const contributedLinks = useWebContributions().profileMenuLinks.filter(
    (link) =>
      (!link.roles || link.roles.includes(role)) &&
      (!link.adminOnly || isAdmin),
  );

  const canPreviewAsStudent = allowedRoles.includes("student");
  const canPreviewAsCreator = allowedRoles.includes("creator");
  const canSwitchWorkspace = canPreviewAsStudent && canPreviewAsCreator;
  const authoringRoleLabel = getRoleDisplayName("creator", userRoles);
  const AuthoringRoleIcon =
    authoringRoleLabel === "Admin" ? ShieldCheck : Users;
  const menuClassName = [
    "profile-menu",
    canSwitchWorkspace ? "profile-menu--switchable" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={id}
      className={menuClassName}
      role="menu"
      aria-label="Profile menu"
      aria-hidden={!isOpen ? true : undefined}
      inert={!isOpen ? true : undefined}
      data-open={isOpen ? "true" : "false"}
      // A menu that has been open may play its closing; one that has never
      // been opened must not (see `.profile-menu--animated` in courses.css).
      data-has-opened={hasOpened ? "" : undefined}
    >
      {identity ? (
        <ProfileMenuIdentity
          {...identity}
          unreadNotificationCount={unreadNotificationCount}
          onNavigate={onNavigate}
          onClose={onClose}
        />
      ) : null}
      {canSwitchWorkspace ? (
        <>
          <div className="profile-menu__group profile-menu__group--roles">
            <p className="profile-menu__section">View as</p>
            <button
              type="button"
              className="profile-menu__item profile-menu__item--role"
              role="menuitemradio"
              aria-checked={role === "student"}
              onClick={() => selectRole("student")}
            >
              <Student
                className="profile-menu__role-icon profile-menu__role-icon--student"
                size={23}
                weight="duotone"
              />
              <span>Student</span>
              {role === "student" ? (
                <Check
                  className="profile-menu__check"
                  size={18}
                  weight="bold"
                />
              ) : (
                <span className="profile-menu__trail" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="profile-menu__item profile-menu__item--role"
              role="menuitemradio"
              aria-checked={role === "creator"}
              onClick={() => selectRole("creator")}
            >
              <AuthoringRoleIcon
                className={`profile-menu__role-icon ${authoringRoleLabel === "Admin" ? "profile-menu__role-icon--admin" : "profile-menu__role-icon--creator"}`}
                size={23}
                weight="duotone"
              />
              <span>{authoringRoleLabel}</span>
              {role === "creator" ? (
                <Check
                  className="profile-menu__check"
                  size={18}
                  weight="bold"
                />
              ) : (
                <span className="profile-menu__trail" aria-hidden="true" />
              )}
            </button>
          </div>
          <div
            className="profile-menu__divider"
            role="separator"
            aria-orientation="horizontal"
          />
        </>
      ) : null}

      {beforeAccountContent}

      <div className="profile-menu__group profile-menu__group--account">
        <a
          className={`profile-menu__item profile-menu__item--notifications ${currentPageItemClasses}${isCurrentPage("/notifications") ? " is-active" : ""}`}
          role="menuitem"
          href="/notifications"
          aria-current={isCurrentPage("/notifications") ? "page" : undefined}
          onClick={(event) => openDestination(event, "/notifications")}
        >
          <Bell
            className="profile-menu__item-icon profile-menu__item-icon--notifications"
            size={21}
            weight={isCurrentPage("/notifications") ? "fill" : "regular"}
          />
          <span>Notifications</span>
          {unreadNotificationCount > 0 ? (
            <span
              className={
                unreadNotificationCount > 9
                  ? "profile-menu__badge profile-menu__badge--overflow"
                  : "profile-menu__badge"
              }
              aria-label={`${unreadNotificationCount} unread notifications`}
            >
              {unreadNotificationCount > 9 ? (
                <>
                  <span className="profile-menu__badge-count">9</span>
                  <span className="profile-menu__badge-plus" aria-hidden="true">
                    +
                  </span>
                </>
              ) : (
                unreadNotificationCount
              )}
            </span>
          ) : null}
        </a>
        <a
          className={`profile-menu__item ${currentPageItemClasses}${isCurrentPage("/progress") ? " is-active" : ""}`}
          role="menuitem"
          href="/progress"
          aria-current={isCurrentPage("/progress") ? "page" : undefined}
          onClick={(event) => openDestination(event, "/progress")}
        >
          <ChartLineUp
            className="profile-menu__item-icon text-[#fb923c]"
            size={21}
            weight={isCurrentPage("/progress") ? "fill" : "regular"}
          />
          <span>Progress</span>
        </a>
        {contributedLinks.map(({ id: linkId, label, href, icon: LinkIcon }) => (
          <a
            key={linkId}
            className="profile-menu__item"
            role="menuitem"
            href={href}
            onClick={(event) => openDestination(event, href)}
          >
            {LinkIcon ? (
              <LinkIcon className="profile-menu__item-icon" size={21} />
            ) : null}
            <span>{label}</span>
          </a>
        ))}
        {role === "student" ? (
          <a
            className={`profile-menu__item profile-menu__item--orders ${currentPageItemClasses}${isCurrentPage("/purchase-history") ? " is-active" : ""}`}
            role="menuitem"
            href="/purchase-history"
            aria-current={
              isCurrentPage("/purchase-history") ? "page" : undefined
            }
            onClick={(event) => openDestination(event, "/purchase-history")}
          >
            <Receipt
              className="profile-menu__item-icon profile-menu__item-icon--orders"
              size={21}
              weight={isCurrentPage("/purchase-history") ? "fill" : "regular"}
            />
            <span>Purchase History</span>
          </a>
        ) : null}
      </div>
      <div
        className="profile-menu__divider"
        role="separator"
        aria-orientation="horizontal"
      />

      {includeSidebarControl && onToggleSidebar ? (
        <div className="profile-menu__group profile-menu__group--session">
          <button
            type="button"
            className="profile-menu__item profile-menu__item--sidebar"
            role="menuitem"
            onClick={() => {
              onToggleSidebar();
              onClose();
            }}
          >
            <EyeSlash
              className="profile-menu__item-icon profile-menu__item-icon--sidebar"
              size={21}
            />
            <span>
              {sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}
            </span>
          </button>
        </div>
      ) : null}

      <div className="profile-menu__group profile-menu__group--logout">
        <button
          type="button"
          className="profile-menu__item profile-menu__item--logout"
          role="menuitem"
          onClick={() => {
            onClose();
            onLogout();
          }}
        >
          <SignOut
            className="profile-menu__item-icon profile-menu__item-icon--logout"
            size={21}
          />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
