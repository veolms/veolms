import { lazy, Suspense, type ReactNode } from "react";
import type { DiscussionEditorProps } from "./DiscussionEditorImpl";

export type {
  DiscussionEditorController,
  DiscussionEditorProps,
} from "./DiscussionEditorImpl";

const loadDiscussionEditorImpl = () => import("./DiscussionEditorImpl");

const DiscussionEditorImpl = lazy(() =>
  loadDiscussionEditorImpl().then((module) => ({
    default: module.DiscussionEditorImpl,
  })),
);

/**
 * Fetches the editor's code ahead of its first use, so a composer that is
 * about to be written in does not wait for it.
 */
export const preloadDiscussionEditor = () => {
  void loadDiscussionEditorImpl().catch(() => {});
};

export function DiscussionEditor({
  fallback,
  ...props
}: DiscussionEditorProps & {
  /** Shown in the editor's place until its code has arrived. */
  fallback?: ReactNode;
}) {
  return (
    // The editor's code arrives after the composer has opened. Until then
    // its place is held at the size it will have (the caller's minimum
    // height), so the composer does not open short and then grow.
    <Suspense
      fallback={
        fallback ?? (
          <div
            aria-hidden="true"
            className={`min-h-0 w-full ${props.className ?? ""}`}
          />
        )
      }
    >
      <DiscussionEditorImpl {...props} />
    </Suspense>
  );
}
