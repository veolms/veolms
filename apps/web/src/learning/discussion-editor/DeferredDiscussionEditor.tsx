import { lazy, Suspense } from "react";
import type { DiscussionEditorProps } from "./DiscussionEditor.types";
import { createDiscussionDraft } from "./types";

// Attachment storage is a development adapter. Keep the service/API graph in
// the editor's click-loaded module instead of importing it with every compact
// comment card on production lesson pages.
const DISCUSSION_ATTACHMENTS_ENABLED = import.meta.env.DEV;

const DiscussionEditor = lazy(() =>
  import("./DiscussionEditor").then((module) => ({
    default: module.DiscussionEditor,
  })),
);

export function DeferredDiscussionEditor(props: DiscussionEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-busy="true"
          aria-label={`Loading ${props.label} editor`}
          className={`min-h-24 w-full ${props.className ?? ""}`}
        >
          <span className="sr-only">Loading {props.label} editor…</span>
        </div>
      }
    >
      <DiscussionEditor
        {...props}
        attachmentsEnabled={DISCUSSION_ATTACHMENTS_ENABLED}
        createDraft={createDiscussionDraft}
      />
    </Suspense>
  );
}
