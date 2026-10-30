import { useRef, type Dispatch, type SetStateAction } from "react";
import type { CourseRole } from "../../courses/catalogue";

interface UseMobileMenuRoleSwitchArgs {
  mobileMenuOpen: boolean;
  setRole: Dispatch<SetStateAction<CourseRole>>;
  dismissMobileMenuThen: (action: () => void) => void;
}

/**
 * Picking Student or Admin in the phone menu closes the menu first and
 * switches once it has slid away. The switch renders a different home page;
 * doing it while the sheet slides down made the close stutter.
 */
export function useMobileMenuRoleSwitch({
  mobileMenuOpen,
  setRole,
  dismissMobileMenuThen,
}: UseMobileMenuRoleSwitchArgs) {
  const pendingRoleRef = useRef<CourseRole | null>(null);

  const switchRoleFromMobileMenu = (role: CourseRole) => {
    if (!mobileMenuOpen) {
      setRole(role);
      return;
    }
    pendingRoleRef.current = role;
    dismissMobileMenuThen(() => {});
  };

  /** Call from the drawer's `onOpenChangeComplete(false)`. */
  const applyRoleAfterMobileMenuClosed = () => {
    const role = pendingRoleRef.current;
    pendingRoleRef.current = null;
    if (role) setRole(role);
  };

  return { switchRoleFromMobileMenu, applyRoleAfterMobileMenuClosed };
}
