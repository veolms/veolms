import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { useEffect, useState } from "react";
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
  sidebarHidden?: boolean;
  includeSidebarControl?: boolean;
  id?: string;
  className?: string;
  onClose: () => void;
  onRoleChange: (role: CourseRole) => void;
  onToggleSidebar?: () => void;
  onLogout: () => void;
}

export function ProfileMenu({
  role,
  allowedRoles,
  userRoles,
  sidebarHidden = false,
  includeSidebarControl = true,
  id,
  className,
  onClose,
  onRoleChange,
  onToggleSidebar,
  onLogout,
}: ProfileMenuProps) {
  const selectRole = (nextRole: CourseRole) => {
    onRoleChange(nextRole);
    onClose();
  };
  const canPreviewAsStudent = allowedRoles.includes("student");
  const canPreviewAsCreator = allowedRoles.includes("creator");
  const canSwitchWorkspace = canPreviewAsStudent && canPreviewAsCreator;
  const authoringRoleLabel = getRoleDisplayName("creator", userRoles);

  return (
    <div
      id={id}
      className={className ? `profile-menu ${className}` : "profile-menu"}
      role="menu"
    >
      {canSwitchWorkspace ? (
        <>
          <p>Preview workspace as</p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={role === "student"}
            onClick={() => selectRole("student")}
          >
            <Student size={18} />
            <span>Student</span>
            {role === "student" && (
              <Check className="profile-menu__check" size={16} weight="bold" />
            )}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={role === "creator"}
            onClick={() => selectRole("creator")}
          >
            <Users size={18} />
            <span>{authoringRoleLabel}</span>
            {role === "creator" && (
              <Check className="profile-menu__check" size={16} weight="bold" />
            )}
          </button>
        </>
      ) : null}
      {includeSidebarControl && onToggleSidebar && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onToggleSidebar();
            onClose();
          }}
        >
          <SidebarSimple size={18} />
          <span>{sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}</span>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onLogout();
        }}
      >
        <SignOut size={18} />
        <span>Logout</span>
      </button>
    </div>
  );
}
