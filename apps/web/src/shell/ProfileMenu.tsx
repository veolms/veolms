import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { useEffect, useState, type MouseEvent } from "react";
import type { AvatarImageVariant } from "@veolms/contracts";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";
import type { CourseRole } from "../courses/catalogue";
import { getRoleDisplayName } from "./workspaceRole";

const FALLBACK_AVATAR_CLASS =
  "shell-profile-avatar shell-profile-avatar--fallback";

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

interface ProfileMenuProps {
  role: CourseRole;
  allowedRoles: readonly CourseRole[];
  userRoles?: readonly string[] | null;
  unreadNotificationCount?: number;
  sidebarHidden?: boolean;
  includeSidebarControl?: boolean;
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
    >
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

      <div className="profile-menu__group profile-menu__group--account">
        <a
          className="profile-menu__item profile-menu__item--profile"
          role="menuitem"
          href="/settings/profile"
          onClick={(event) => openDestination(event, "/settings/profile")}
        >
          <UserCircle
            className="profile-menu__item-icon profile-menu__item-icon--profile"
            size={21}
          />
          <span>View Profile</span>
        </a>
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
              className="profile-menu__badge"
              aria-label={`${unreadNotificationCount} unread notifications`}
            >
              {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
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
