import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "@atomic-editor/editor";
import "@atomic-editor/editor/styles.css";
import { autocompletion } from "@codemirror/autocomplete";
import { EditorView, placeholder, ViewPlugin } from "@codemirror/view";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import {
  createMentionCompletionSource,
  mentionCompletionOptionClass,
  renderMentionCompletionAddon,
} from "./mentions";
import { createDiscussionClipboardExtension } from "./clipboard";
import { DISCUSSION_CODE_LANGUAGES } from "./code-languages";
import {
  createDiscussionEditorCommands,
  type DiscussionEditorCommands,
  type DiscussionFormattingState,
} from "./commands";
import { selectDiscussionAttachment } from "./attachments";
import { createDiscussionDraft, type DiscussionDraft } from "./types";
import "./atomic-editor.css";
import { DISCUSSION_ATTACHMENTS_ENABLED } from "./image-storage";
import type { LocalComposerAttachment } from "../../services/learning-interactions";

export interface DiscussionEditorController extends DiscussionEditorCommands {
  attach(file: File): Promise<{ accepted: boolean; message: string | null }>;
  getMarkdown(): string;
}

export interface DiscussionEditorProps {
  value: DiscussionDraft;
  documentId: string;
  resetToken?: number;
  label: string;
  placeholderText: string;
  invalid?: boolean;
  autoFocus?: boolean;
  autoGrow?: boolean;
  /** Maximum editor height. Numbers are interpreted as CSS pixels. */
  maxHeight?: CSSProperties["maxHeight"];
  className?: string;
  courseId?: string;
  mentionsEnabled?: boolean;
  onChange: (draft: DiscussionDraft) => void;
  onControllerChange?: (controller: DiscussionEditorController | null) => void;
  onFormattingStateChange?: (state: DiscussionFormattingState) => void;
  onAttachmentError?: (message: string | null) => void;
  onAttachmentSelected?: (attachment: LocalComposerAttachment) => void;
}

export function DiscussionEditor({
  value,
  documentId,
  resetToken = 0,
  label,
  placeholderText,
  invalid = false,
  autoFocus = false,
  autoGrow = false,
  maxHeight,
  className = "",
  courseId,
  mentionsEnabled = true,
  onChange,
  onControllerChange,
  onFormattingStateChange,
  onAttachmentError,
  onAttachmentSelected,
}: DiscussionEditorProps) {
  const editorStyle =
    maxHeight === undefined
      ? undefined
      : ({
          "--atomic-editor-max-height":
            typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
        } as CSSProperties);
  const atomicHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previousResetTokenRef = useRef(resetToken);
  const onChangeRef = useLatest(onChange);
  const onControllerChangeRef = useLatest(onControllerChange);
  const onFormattingStateChangeRef = useLatest(onFormattingStateChange);
  const onAttachmentErrorRef = useLatest(onAttachmentError);
  const onAttachmentSelectedRef = useLatest(onAttachmentSelected);
  const [commands] = useState(() =>
    createDiscussionEditorCommands(() => viewRef.current),
  );
  const controller = useMemo<DiscussionEditorController>(
    () => ({
      ...commands,
      getMarkdown: () => atomicHandleRef.current?.getMarkdown() ?? "",
      attach: async (file) => {
        if (!DISCUSSION_ATTACHMENTS_ENABLED) {
          const message = "Attachments are not available in this deployment.";
          onAttachmentErrorRef.current?.(message);
          return { accepted: false, message };
        }
        const result = await selectDiscussionAttachment(file);
        onAttachmentErrorRef.current?.(result.message);
        if (result.accepted && result.attachment) {
          onAttachmentSelectedRef.current?.(result.attachment);
        }
        return result;
      },
    }),
    [commands, onAttachmentErrorRef, onAttachmentSelectedRef],
  );

  const mentionExtensions = useMemo(() => {
    if (!courseId || mentionsEnabled === false) return [];
    return [
      autocompletion({
        override: [createMentionCompletionSource(courseId)],
        activateOnTyping: true,
        defaultKeymap: true,
        icons: false,
        optionClass: mentionCompletionOptionClass,
        addToOptions: [
          {
            position: 0,
            render: renderMentionCompletionAddon,
          },
        ],
      }),
    ];
  }, [courseId, mentionsEnabled]);

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
      ...mentionExtensions,
      ...(DISCUSSION_ATTACHMENTS_ENABLED
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
      controller,
      invalid,
      label,
      mentionExtensions,
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
    if (previousResetTokenRef.current === resetToken) return;
    previousResetTokenRef.current = resetToken;

    const view = viewRef.current;
    if (!view || view.state.doc.length === 0) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: "",
      },
    });
  }, [resetToken]);

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
      style={editorStyle}
    >
      <AtomicCodeMirrorEditor
        documentId={documentId}
        markdownSource={value.markdown}
        editorHandleRef={atomicHandleRef}
        codeLanguages={DISCUSSION_CODE_LANGUAGES}
        extensions={extensions}
        onMarkdownChange={(markdown) =>
          onChangeRef.current(createDiscussionDraft(markdown))
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
