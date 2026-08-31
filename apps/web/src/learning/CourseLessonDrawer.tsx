import type { ComponentProps, ReactNode } from "react";
import "../learning-interactions.css";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

export interface CourseLessonDrawerProps {
  children: ReactNode;
  contentProps: Omit<ComponentProps<typeof DrawerContent>, "children">;
  drawerProps: ComponentProps<typeof Drawer>;
  resizeHandle?: ReactNode;
}

/** Runtime-only shell for the course curriculum drawer. */
export function CourseLessonDrawer({
  children,
  contentProps,
  drawerProps,
  resizeHandle,
}: CourseLessonDrawerProps) {
  return (
    <Drawer {...drawerProps}>
      <DrawerContent {...contentProps}>
        {resizeHandle}
        <DrawerTitle className="sr-only">Course lessons</DrawerTitle>
        <DrawerDescription className="sr-only">
          Browse sections and choose a lesson.
        </DrawerDescription>
        {children}
      </DrawerContent>
    </Drawer>
  );
}
