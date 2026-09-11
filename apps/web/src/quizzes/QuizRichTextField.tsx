import { useMemo, useState } from "react";
import { CommentFormattingToolbar } from "../learning/CommentFormattingToolbar";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "../learning/discussion-editor/DiscussionEditor";
import type { DiscussionFormattingState } from "../learning/discussion-editor/commands";
import { createDiscussionDraft } from "../learning/discussion-editor/types";

interface Props {
  label: string;
  value: string;
  placeholder: string;
  documentId: string;
  minHeight?: string;
  onChange: (value: string) => void;
}

const EMPTY_FORMATTING_STATE: DiscussionFormattingState = {
  bold: false,
  italic: false,
  highlight: false,
  link: false,
  code: false,
  codeBlock: false,
  canUndo: false,
  canRedo: false,
  linkUrl: "",
};

export function QuizRichTextField({
  label,
  value,
  placeholder,
  documentId,
  minHeight = "min-h-28",
  onChange,
}: Props) {
  const [controller, setController] =
    useState<DiscussionEditorController | null>(null);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);
  const draft = useMemo(() => createDiscussionDraft(value), [value]);

  return (
    <div className="overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] shadow-[inset_0_1px_2px_color-mix(in_srgb,black_10%,transparent)] transition-all focus-within:border-(--accent) focus-within:ring-2 focus-within:ring-(--accent)/20">
      <DiscussionEditor
        value={draft}
        documentId={documentId}
        label={label}
        placeholderText={placeholder}
        autoGrow
        className={`${minHeight} px-2.5 sm:px-3.5 py-2 sm:py-3 text-xs sm:text-sm text-(--text)`}
        onChange={(next) => onChange(next.markdown)}
        onControllerChange={setController}
        onFormattingStateChange={setFormattingState}
      />
      <div className="flex min-h-11 items-center border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_65%,var(--surface))] px-2">
        {controller ? (
          <CommentFormattingToolbar
            editor={controller}
            formattingState={formattingState}
          />
        ) : null}
      </div>
    </div>
  );
}
