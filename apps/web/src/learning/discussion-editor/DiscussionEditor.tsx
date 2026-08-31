import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "@atomic-editor/editor";
import "@atomic-editor/editor/styles.css";
import { EditorView, placeholder, ViewPlugin } from "@codemirror/view";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createDiscussionClipboardExtension } from "./clipboard";
import { DISCUSSION_CODE_LANGUAGES } from "./code-languages";
import { createDiscussionEditorCommands } from "./commands";
import { insertDiscussionAttachment } from "./attachments";
import "./atomic-editor.css";
import type {
  DiscussionEditorController,
  DiscussionEditorProps,
} from "./DiscussionEditor.types";

interface DiscussionEditorImplementationProps extends DiscussionEditorProps {
  attachmentsEnabled: boolean;
  createDraft: (markdown: string) => DiscussionEditorProps["value"];
}

export function DiscussionEditor({
  value,
  documentId,
  label,
  placeholderText,
  invalid = false,
  autoFocus = false,
  autoGrow = false,
  className = "",
  onChange,
  onControllerChange,
  onFormattingStateChange,
  onAttachmentNotice,
  attachmentsEnabled,
  createDraft,
}: DiscussionEditorImplementationProps) {
  const atomicHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useLatest(onChange);
  const onControllerChangeRef = useLatest(onControllerChange);
  const onFormattingStateChangeRef = useLatest(onFormattingStateChange);
  const onAttachmentNoticeRef = useLatest(onAttachmentNotice);
  const [commands] = useState(() =>
    createDiscussionEditorCommands(() => viewRef.current),
  );
  const controller = useMemo<DiscussionEditorController>(
    () => ({
      ...commands,
      getMarkdown: () => atomicHandleRef.current?.getMarkdown() ?? "",
      attach: async (file) => {
        if (!attachmentsEnabled) {
          const message = "Attachments are not available in this deployment.";
          onAttachmentNoticeRef.current?.(message);
          return { inserted: false, message };
        }
        onAttachmentNoticeRef.current?.("Uploading attachment…");
        const result = await insertDiscussionAttachment(commands, file);
        onAttachmentNoticeRef.current?.(result.message);
        return result;
      },
    }),
    [attachmentsEnabled, commands, onAttachmentNoticeRef],
  );

  const extensions = useMemo(
    () => [
      placeholder(placeholderText),
      EditorView.contentAttributes.of({
        "aria-label": label,
        "aria-multiline": "true",
        "aria-invalid": invalid ? "true" : "false",
        autocapitalize: "sentences",
        role: "textbox",
        spellcheck: "true",
      }),
      ...(attachmentsEnabled
        ? [
            createDiscussionClipboardExtension({
              onFiles: (files) => {
                void (async () => {
                  for (const file of files) await controller.attach(file);
                })();
              },
            }),
          ]
        : []),
      ViewPlugin.fromClass(
        class {
          constructor(view: EditorView) {
            viewRef.current = view;
            onControllerChangeRef.current?.(controller);
            onFormattingStateChangeRef.current?.(
              controller.getFormattingState(),
            );
          }

          update() {
            onFormattingStateChangeRef.current?.(
              controller.getFormattingState(),
            );
          }

          destroy() {
            viewRef.current = null;
            onControllerChangeRef.current?.(null);
          }
        },
      ),
    ],
    [
      attachmentsEnabled,
      controller,
      invalid,
      label,
      onControllerChangeRef,
      onFormattingStateChangeRef,
      placeholderText,
    ],
  );

  useEffect(() => {
    const content = atomicHandleRef.current?.getContentDOM();
    if (!content) return;
    content.setAttribute("aria-label", label);
    content.setAttribute("aria-invalid", invalid ? "true" : "false");
  }, [invalid, label]);

  useEffect(() => {
    const callback = onControllerChangeRef.current;
    callback?.(controller);
    return () => callback?.(null);
  }, [controller, onControllerChangeRef]);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = window.setTimeout(() => atomicHandleRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [autoFocus, documentId]);

  return (
    <div
      data-discussion-atomic-editor
      data-auto-grow={autoGrow || undefined}
      className={`learning-discussion-atomic-editor min-h-0 w-full ${className}`}
    >
      <AtomicCodeMirrorEditor
        documentId={documentId}
        markdownSource={value.markdown}
        editorHandleRef={atomicHandleRef}
        codeLanguages={DISCUSSION_CODE_LANGUAGES}
        extensions={extensions}
        onMarkdownChange={(markdown) =>
          onChangeRef.current(createDraft(markdown))
        }
      />
    </div>
  );
}

function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
