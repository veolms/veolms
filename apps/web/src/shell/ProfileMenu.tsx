import type { AvatarImageVariant } from "@veolms/contracts";

import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { type MouseEvent, type ReactNode, useState } from "react";

import { ResponsiveAvatar } from "../components/ResponsiveAvatar";
import type { CourseRole } from "../courses/catalogue";

import { getRoleDisplayName } from "./workspaceRole";

const FALLBACK_AVATAR_CLASS = "shell-profile-avatar shell-profile-avatar--fallback";

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
  const profilePath = `/${encodeURIComponent(username)}`;
  const handleProfileClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
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
        className="profile-menu__identity-link absolute inset-0 z-0 flex min-w-0 items-center gap-1 rounded-[inherit] py-1 pr-2 pl-0.5 text-inherit no-underline transition-colors outline-none hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,white_10%)]! focus-visible:ring-2 focus-visible:ring-(--accent)"
        href={profilePath}
        aria-label={`Open ${displayName}'s public profile`}
        role={mobile ? undefined : "menuitem"}
        onClick={handleProfileClick}
      >
        <span className="courses-profile__avatar-wrap">
          <ShellProfileAvatar avatarUrl={avatarUrl} avatarSrcSet={avatarSrcSet} />
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
          <small className="truncate text-[0.72rem] text-(--muted)">@{username}</small>
        </span>
      </a>
      <button
        type="button"
        className="profile-menu__identity-edit group absolute top-1/2 right-1.5 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_84%,black_16%)]! p-0 text-(--muted) transition-colors outline-none hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
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

export function ShellProfileAvatar({
  avatarUrl,
  avatarSrcSet,
}: {
  avatarUrl: string | null;
  avatarSrcSet?: readonly AvatarImageVariant[] | null;
}) {
  const sourceIdentity = JSON.stringify([
    avatarUrl,
    avatarSrcSet?.map(({ url, width }) => [url, width]) ?? null,
  ]);
  const [failedSourceIdentity, setFailedSourceIdentity] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl) && failedSourceIdentity !== sourceIdentity;
  const avatarSources = avatarSrcSet?.length ? avatarSrcSet : undefined;

  return (
    <i
      className={showImage && avatarUrl ? "shell-profile-avatar" : FALLBACK_AVATAR_CLASS}
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
          onError={() => setFailedSourceIdentity(sourceIdentity)}
        />
      ) : (
        <UserCircle size={28} weight="duotone" />
      )}
    </i>
  );
}

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
  const selectRole = (nextRole: CourseRole) => {
    onRoleChange(nextRole);
    onClose();
  };
  const openDestination = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      onClose();
      return;
    }
    event.preventDefault();
    onNavigate(path);
  };

  const canPreviewAsStudent = allowedRoles.includes("student");
  const canPreviewAsCreator = allowedRoles.includes("creator");
  const canSwitchWorkspace = canPreviewAsStudent && canPreviewAsCreator;
  const authoringRoleLabel = getRoleDisplayName("creator", userRoles);
  const AuthoringRoleIcon = authoringRoleLabel === "Admin" ? ShieldCheck : Users;
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
                <Check className="profile-menu__check" size={18} weight="bold" />
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
                <Check className="profile-menu__check" size={18} weight="bold" />
              ) : (
                <span className="profile-menu__trail" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="profile-menu__divider" role="separator" aria-orientation="horizontal" />
        </>
      ) : null}

      {beforeAccountContent}

      <div className="profile-menu__group profile-menu__group--account">
        <a
          className="profile-menu__item profile-menu__item--notifications"
          role="menuitem"
          href="/notifications"
          onClick={(event) => openDestination(event, "/notifications")}
        >
          <Bell
            className="profile-menu__item-icon profile-menu__item-icon--notifications"
            size={21}
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
        {role === "student" ? (
          <a
            className="profile-menu__item profile-menu__item--orders"
            role="menuitem"
            href="/purchase-history"
            onClick={(event) => openDestination(event, "/purchase-history")}
          >
            <Receipt
              className="profile-menu__item-icon profile-menu__item-icon--orders"
              size={21}
            />
            <span>Purchase History</span>
          </a>
        ) : null}
      </div>
      <div className="profile-menu__divider" role="separator" aria-orientation="horizontal" />

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
            <span>{sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}</span>
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
          <SignOut className="profile-menu__item-icon profile-menu__item-icon--logout" size={21} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
