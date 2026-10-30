import { Suspense, type Dispatch, type SetStateAction } from "react";
import type { CSSProperties } from "react";
import type { CourseRole } from "../courses/catalogue";
import { getNavigationIconColor, type NavigationItem } from "./navigation";
import type { NavigationItemWithMetadata } from "./navigation";
import type { SidebarPreferences } from "../settings/settingsPreferences";
import type { NavigateTo } from "../routing/navigation";
import { ProfileMenu } from "./academyLazyPages";

export interface MobileSheetProfileMenuProps {
  isAuthenticated: boolean;
  effectiveRole: CourseRole;
  allowedWorkspaceRoles: CourseRole[];
  userRoles: readonly string[] | undefined;
  unreadNotificationCount: number;
  mobileMoreNavigation: NavigationItem[];
  isNavigationItemActive: (item: NavigationItemWithMetadata) => boolean;
  sidebarPreferences: SidebarPreferences;
  selectNavigation: (label: string, item?: NavigationItemWithMetadata) => void;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  /** Closes the menu, then switches to the picked role. */
  setRole: (role: CourseRole) => void;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  dismissProfileMenuThen: (afterDismiss: () => void) => void;
  dismissMobileMenuThen: (action: () => void) => void;
  onNavigatePage: NavigateTo;
  setLogoutConfirmOpen: Dispatch<SetStateAction<boolean>>;
}

export function MobileSheetProfileMenu({
  isAuthenticated,
  effectiveRole,
  allowedWorkspaceRoles,
  userRoles,
  unreadNotificationCount,
  mobileMoreNavigation,
  isNavigationItemActive,
  sidebarPreferences,
  selectNavigation,
  setProfileMenu,
  setRole,
  setEdgeSidebarOpen,
  dismissProfileMenuThen,
  dismissMobileMenuThen,
  onNavigatePage,
  setLogoutConfirmOpen,
}: MobileSheetProfileMenuProps) {
  // prettier-ignore
  return (
    <div className="mobile-menu-sheet__scroll overflow-x-hidden pb-11">
      {isAuthenticated && (
        <Suspense fallback={null}>
          <ProfileMenu
            id="mobile-profile-menu"
            className="mobile-menu-sheet__profile-menu"
            role={effectiveRole}
            allowedRoles={allowedWorkspaceRoles}
            userRoles={userRoles}
            unreadNotificationCount={unreadNotificationCount}
            includeSidebarControl={false}
            beforeAccountContent={
              <div
                className="mobile-menu-sheet__list mobile-menu-sheet__profile-navigation"
                role="group"
                aria-label="Additional navigation"
              >
                {mobileMoreNavigation.map((item) => {
                  const [label, Icon] = item;
                  const active = isNavigationItemActive(item);
                  return (
                    <button
                      type="button"
                      key={label}
                      className={active ? "is-active" : ""}
                      style={
                        {
                          "--nav-icon-color":
                            getNavigationIconColor(
                              label,
                              sidebarPreferences,
                            ),
                        } as CSSProperties
                      }
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      data-sidebar-swipe-ignore
                      aria-label={label}
                      onClick={() => selectNavigation(label, item)}
                    >
                      <Icon
                        size={23}
                        weight={active ? "fill" : "regular"}
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            }
            onClose={() => setProfileMenu(false)}
            onRoleChange={setRole}
            onNavigate={(path) => {
              setEdgeSidebarOpen(false);
              dismissProfileMenuThen(() => {
                dismissMobileMenuThen(() => onNavigatePage(path));
              });
            }}
            onLogout={() => {
              // Closing the sheet steps back in history. Opened at once, the
              // question took that Back as its own and closed again (first
              // tap did nothing on the phone), so it opens once the step lands.
              setEdgeSidebarOpen(false);
              dismissProfileMenuThen(() => {
                dismissMobileMenuThen(() => setLogoutConfirmOpen(true));
              });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
