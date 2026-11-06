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
      {/* A guest gets the same menu with only Log in and Help and
          feedback (see ProfileMenu's `guest`). */}
      {profileMenuSurfaceMounted && (
        <Suspense fallback={null}>
          <ProfileMenu
            id="desktop-profile-menu"
            // Beside the collapsed sidebar the menus share one bottom line;
            // the guest's, three rows long, opens level with its button.
            className={
              isAuthenticated
                ? "profile-menu--animated"
                : "profile-menu--animated in-[.courses-app--collapsed]:top-0! in-[.courses-app--collapsed]:bottom-auto!"
            }
            isOpen={profileMenu}
            role={effectiveRole}
            allowedRoles={isAuthenticated ? allowedWorkspaceRoles : []}
            guest={!isAuthenticated}
            onLogin={
              isAuthenticated
                ? undefined
                : () => {
                    setEdgeSidebarOpen(false);
                    dismissProfileMenuThen(() => onNavigatePage("/login"));
                  }
            }
            userRoles={userRoles}
            identity={
              isAuthenticated && activeUser?.username
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
