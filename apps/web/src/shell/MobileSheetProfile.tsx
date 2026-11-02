import { Suspense, type Dispatch, type SetStateAction } from "react";
import { EarlyProfileButtons } from "./EarlyProfileButtons";
import type { AuthIdentityHint } from "../store/auth.store";
import type { NavigateTo } from "../routing/navigation";
import { ProfileMenuIdentity } from "./academyLazyPages";
import { LoginProfileButton } from "./LoginProfileButton";
import type { AuthUser } from "../store/auth.store";

export interface MobileSheetProfileProps {
  isAuthenticated: boolean;
  activeUser: AuthUser | null | undefined;
  shellProfileDisplayName: string;
  shellProfileAvatarUrl: string | null;
  shellProfileAvatarSrcSet: { url: string; width: number; height: number }[];
  unreadNotificationCount: number;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  dismissProfileMenuThen: (afterDismiss: () => void) => void;
  dismissMobileMenuThen: (action: () => void) => void;
  onNavigatePage: NavigateTo;
  accountStatusUnknown: boolean;
  authUserFetched: boolean;
  authIdentityHint: AuthIdentityHint | null;
}

export function MobileSheetProfile({
  isAuthenticated,
  activeUser,
  shellProfileDisplayName,
  shellProfileAvatarUrl,
  shellProfileAvatarSrcSet,
  unreadNotificationCount,
  setProfileMenu,
  setEdgeSidebarOpen,
  dismissProfileMenuThen,
  dismissMobileMenuThen,
  onNavigatePage,
  accountStatusUnknown,
  authUserFetched,
  authIdentityHint,
}: MobileSheetProfileProps) {
  // prettier-ignore
  return (
    <div
      className="mobile-menu-sheet__profile-wrap mt-2"
      data-profile-surface
    >
      {isAuthenticated && activeUser?.username ? (
        <Suspense fallback={null}>
          <ProfileMenuIdentity
            variant="mobile"
            displayName={shellProfileDisplayName}
            username={activeUser.username}
            avatarUrl={shellProfileAvatarUrl}
            avatarSrcSet={shellProfileAvatarSrcSet}
            unreadNotificationCount={unreadNotificationCount}
            onClose={() => setProfileMenu(false)}
            onNavigate={(path) => {
              setEdgeSidebarOpen(false);
              dismissProfileMenuThen(() => {
                dismissMobileMenuThen(() => onNavigatePage(path));
              });
            }}
          />
        </Suspense>
      ) : !authUserFetched ? (
        <EarlyProfileButtons
          className="mobile-menu-sheet__profile courses-profile__button profile-menu__identity rounded-2xl! p-0! ps-2! pe-3! bg-[color-mix(in_srgb,var(--surface-strong)_94%,white_6%)]! hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,white_10%)]!"
          arrowSize={17}
          onLogin={() => onNavigatePage("/login")}
        />
      ) : (
        <LoginProfileButton
          className="mobile-menu-sheet__profile courses-profile__button profile-menu__identity rounded-2xl! p-0! ps-2! pe-3! bg-[color-mix(in_srgb,var(--surface-strong)_94%,white_6%)]! hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,white_10%)]!"
          arrowSize={17}
          preloadWhenShown
          onLogin={() => onNavigatePage("/login")}
        />
      )}
    </div>
  );
}
