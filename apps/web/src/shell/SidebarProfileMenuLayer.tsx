import { Suspense, type Dispatch, type SetStateAction } from "react";
import type { CourseRole } from "../courses/catalogue";
import type { SidebarMode } from "../settings/settingsPreferences";
import type { NavigateTo } from "../routing/navigation";
import { ProfileMenu } from "./academyLazyPages";
import type { AuthUser } from "../store/auth.store";

export interface SidebarProfileMenuLayerProps {
  isAuthenticated: boolean;
  profileMenuSurfaceMounted: boolean;
  profileMenu: boolean;
  effectiveRole: CourseRole;
  allowedWorkspaceRoles: CourseRole[];
  userRoles: readonly string[] | undefined;
  activeUser: AuthUser | null | undefined;
  shellProfileDisplayName: string;
  shellProfileAvatarUrl: string | null;
  shellProfileAvatarSrcSet: { url: string; width: number; height: number }[];
  unreadNotificationCount: number;
  sidebarPresentedAsOverlay: boolean;
  compactNavigation: boolean;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  setRole: Dispatch<SetStateAction<CourseRole>>;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  dismissProfileMenuThen: (afterDismiss: () => void) => void;
  dismissMobileMenuThen: (action: () => void) => void;
  onNavigatePage: NavigateTo;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarHidden: boolean;
  openLogoutConfirm: () => void;
}

export function SidebarProfileMenuLayer({
  isAuthenticated,
  profileMenuSurfaceMounted,
  profileMenu,
  effectiveRole,
  allowedWorkspaceRoles,
  userRoles,
  activeUser,
  shellProfileDisplayName,
  shellProfileAvatarUrl,
  shellProfileAvatarSrcSet,
  unreadNotificationCount,
  sidebarPresentedAsOverlay,
  compactNavigation,
  setProfileMenu,
  setRole,
  setEdgeSidebarOpen,
  dismissProfileMenuThen,
  dismissMobileMenuThen,
  onNavigatePage,
  setSidebarMode,
  sidebarHidden,
  openLogoutConfirm,
}: SidebarProfileMenuLayerProps) {
  // prettier-ignore
  return (
    <>
      {isAuthenticated && profileMenuSurfaceMounted && (
        <Suspense fallback={null}>
          <ProfileMenu
            id="desktop-profile-menu"
            className="profile-menu--animated"
            isOpen={profileMenu}
            role={effectiveRole}
            allowedRoles={allowedWorkspaceRoles}
            userRoles={userRoles}
            identity={
              activeUser?.username
                ? {
                    displayName: shellProfileDisplayName,
                    username: activeUser.username,
                    avatarUrl: shellProfileAvatarUrl,
                    avatarSrcSet: shellProfileAvatarSrcSet,
                  }
                : undefined
            }
            unreadNotificationCount={
              isAuthenticated ? unreadNotificationCount : 0
            }
            sidebarHidden={sidebarPresentedAsOverlay}
            includeSidebarControl={!compactNavigation}
            onClose={() => setProfileMenu(false)}
            onRoleChange={setRole}
            onNavigate={(path) => {
              setEdgeSidebarOpen(false);
              dismissProfileMenuThen(() => {
                dismissMobileMenuThen(() => onNavigatePage(path));
              });
            }}
            onToggleSidebar={() => {
              setSidebarMode(sidebarHidden ? "expanded" : "hidden");
              setEdgeSidebarOpen(false);
            }}
            onLogout={openLogoutConfirm}
          />
        </Suspense>
      )}
    </>
  );
}
