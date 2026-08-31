import { lazy, Suspense } from "react";
import type { CommentComposerProps } from "./CommentComposer";

let commentComposerModule:
  Promise<typeof import("./CommentComposer")> | undefined;

const loadCommentComposer = () => {
  commentComposerModule ??= import("./CommentComposer");
  return commentComposerModule;
};

const LazyCommentComposer = lazy(async () => {
  const module = await loadCommentComposer();
  return { default: module.CommentComposer };
});

export const preloadCommentComposer = () => {
  void loadCommentComposer();
};

/** Keeps the rich publishing UI outside the initial collapsed discussion. */
export function DeferredCommentComposer(props: CommentComposerProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading discussion editor"
          className="grid min-h-34 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] text-sm text-(--muted) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)]"
        >
          Preparing editor…
        </div>
      }
    >
      <LazyCommentComposer {...props} />
    </Suspense>
  );
}
