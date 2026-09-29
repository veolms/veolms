import { lazy, Suspense } from "react";
import type { DiscussionEditorProps } from "./DiscussionEditorImpl";

export type {
  DiscussionEditorController,
  DiscussionEditorProps,
} from "./DiscussionEditorImpl";

const DiscussionEditorImpl = lazy(() =>
  import("./DiscussionEditorImpl").then((module) => ({
    default: module.DiscussionEditorImpl,
  })),
);

export function DiscussionEditor(props: DiscussionEditorProps) {
  return (
    <Suspense fallback={null}>
      <DiscussionEditorImpl {...props} />
    </Suspense>
  );
}
