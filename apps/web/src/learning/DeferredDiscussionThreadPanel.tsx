import { lazy, Suspense } from "react";
import type { DiscussionThreadPanelProps } from "./DiscussionThreadPanel";

let discussionThreadPanelModule:
  Promise<typeof import("./DiscussionThreadPanel")> | undefined;

const loadDiscussionThreadPanel = () => {
  discussionThreadPanelModule ??= import("./DiscussionThreadPanel");
  return discussionThreadPanelModule;
};

const LazyDiscussionThreadPanel = lazy(async () => {
  const module = await loadDiscussionThreadPanel();
  return { default: module.DiscussionThreadPanel };
});

export const preloadDiscussionThreadPanel = () => {
  void loadDiscussionThreadPanel();
};

/** Swiper and the thread drawer are requested only after a thread is opened. */
export function DeferredDiscussionThreadPanel(
  props: DiscussionThreadPanelProps,
) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LazyDiscussionThreadPanel {...props} />
    </Suspense>
  );
}
