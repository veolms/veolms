import { lazy, Suspense } from "react";
import type { MobileDiscussionComposerDrawerProps } from "./MobileDiscussionComposerDrawer";

let mobileComposerDrawerModule:
  Promise<typeof import("./MobileDiscussionComposerDrawer")> | undefined;

const loadMobileDiscussionComposerDrawer = () => {
  mobileComposerDrawerModule ??= import("./MobileDiscussionComposerDrawer");
  return mobileComposerDrawerModule;
};

const LazyMobileDiscussionComposerDrawer = lazy(async () => {
  const module = await loadMobileDiscussionComposerDrawer();
  return { default: module.MobileDiscussionComposerDrawer };
});

export const preloadMobileDiscussionComposerDrawer = () => {
  void loadMobileDiscussionComposerDrawer();
};

interface DeferredMobileDiscussionComposerDrawerProps extends MobileDiscussionComposerDrawerProps {
  requested: boolean;
}

/** Keeps the mobile-only drawer primitives out of desktop and closed states. */
export function DeferredMobileDiscussionComposerDrawer({
  requested,
  ...props
}: DeferredMobileDiscussionComposerDrawerProps) {
  if (!requested) return null;

  return (
    <Suspense fallback={null}>
      <LazyMobileDiscussionComposerDrawer {...props} />
    </Suspense>
  );
}
