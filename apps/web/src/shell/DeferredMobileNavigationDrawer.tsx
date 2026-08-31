import type { ComponentProps, ReactNode } from "react";
import "../learning-interactions.css";

import { Drawer, DrawerContent } from "../components/ui/drawer";

interface DeferredMobileNavigationDrawerProps {
  children: ReactNode;
  contentProps: ComponentProps<typeof DrawerContent>;
  drawerProps: ComponentProps<typeof Drawer>;
  sidebarSwipeIgnore?: boolean;
}

/**
 * Keeps the sizeable touch-drawer runtime out of desktop and unopened mobile
 * navigation. The shell requests this module on the first explicit More-menu
 * interaction and retains it afterwards so close/reopen motion is preserved.
 */
export function DeferredMobileNavigationDrawer({
  children,
  contentProps,
  drawerProps,
  sidebarSwipeIgnore = false,
}: DeferredMobileNavigationDrawerProps) {
  return (
    <Drawer {...drawerProps}>
      <DrawerContent
        {...contentProps}
        data-sidebar-swipe-ignore={sidebarSwipeIgnore || undefined}
      >
        {children}
      </DrawerContent>
    </Drawer>
  );
}
