import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FileArrowUpIcon as FileArrowUp } from "@phosphor-icons/react/FileArrowUp";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { LESSON_DOCUMENT_BODY_MAX_LENGTH } from "@veolms/contracts";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { CourseDescriptionEditor } from "../CourseDescriptionEditor";
import { DiscussionMarkdown } from "../../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../../learning/discussion-editor/types";

/** A Markdown file worth reading into the editor (1 MB of text is a book). */
const MARKDOWN_IMPORT_MAX_BYTES = 1024 * 1024;

export function isMarkdownFile(file: File): boolean {
  return (
    /\.(md|markdown|txt)$/i.test(file.name) ||
    file.type === "text/markdown" ||
    file.type === "text/plain"
  );
}

/**
 * Reads a Markdown file the creator chose into text for the reading. The
 * file never leaves the browser: the text is saved with the lesson.
 */
export async function readMarkdownFile(file: File): Promise<string> {
  if (file.size > MARKDOWN_IMPORT_MAX_BYTES) {
    throw new Error("That file is too long to import (1 MB at most).");
  }
  const text = (await file.text()).replace(/\r\n?/g, "\n");
  if (text.length > LESSON_DOCUMENT_BODY_MAX_LENGTH) {
    throw new Error("That file is too long to import.");
  }
  return text;
}

export interface LessonReadingEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** A problem to show (a file that could not be imported, say). */
  onError?: (message: string) => void;
}

/**
 * The text of a document lesson, written with a formatting toolbar and read
 * back in the Preview tab exactly as learners will see it (the player's own
 * renderer and options).
 */
export function LessonReadingEditor({
  id,
  value,
  onChange,
  disabled = false,
  onError,
}: LessonReadingEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  // Rendering a long reading should never hold up typing.
  const previewText = useDeferredValue(mode === "preview" ? value : "");
  const previewContent = useMemo(
    () => createDiscussionDraft(previewText),
    [previewText],
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // An import over written text says how to get that text back.
  const [replacedText, setReplacedText] = useState(false);

  const importFile = async (file: File) => {
    try {
      const text = await readMarkdownFile(file);
      setReplacedText(Boolean(value.trim()));
      onChange(text);
      setMode("write");
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "That file could not be read.",
      );
    }
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] sm:text-[0.82rem] font-bold cursor-pointer transition-colors ${
      active
        ? "border-(--accent) text-(--accent)"
        : "border-transparent text-(--muted) hover:text-(--text)"
    }`;

  return (
    <div className="flex flex-col overflow-hidden rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow)">
      <div className="flex items-center justify-between gap-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] pl-3 pr-2">
        <div role="tablist" aria-label="Reading" className="flex items-center">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "write"}
            onClick={() => setMode("write")}
            className={tabClass(mode === "write")}
          >
            <PencilSimple size={15} weight="bold" />
            <span>Write</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={tabClass(mode === "preview")}
          >
            <Eye size={15} weight="bold" />
            <span>Preview</span>
          </button>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => importInputRef.current?.click()}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-3 text-[0.74rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileArrowUp size={15} weight="bold" />
          <span>Import .md</span>
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          aria-label="Import a Markdown file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>

      <div className="p-3 sm:p-4">
        {replacedText && mode === "write" ? (
          <p role="status" className="m-0 mb-2.5 text-[0.74rem] text-(--muted)">
            The file replaced your text. Press Ctrl+Z (Cmd+Z on a Mac) in the
            editor to bring it back.
          </p>
        ) : null}
        {mode === "write" ? (
          <CourseDescriptionEditor
            id={id}
            label="Reading"
            placeholder="Write the reading for this lesson. Use the toolbar for headings, lists, code and links."
            value={value}
            onChange={onChange}
            maxLength={LESSON_DOCUMENT_BODY_MAX_LENGTH}
            disabled={disabled}
            documentTools
            minHeightClassName="min-h-[320px]"
            counter="words"
          />
        ) : previewText.trim() ? (
          <div className="max-h-[560px] overflow-y-auto rounded-[10px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-3 sm:px-5 sm:py-4">
            <DiscussionMarkdown
              content={previewContent}
              label="Reading preview"
              preserveSoftBreaks
              className="max-w-none! wrap-anywhere [&>:first-child]:mt-0"
            />
          </div>
        ) : (
          <p className="m-0 rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-4 py-8 text-center text-[0.80rem] text-(--muted)">
            Nothing to preview yet. Write the reading in the Write tab.
          </p>
        )}
      </div>
    </div>
  );
}
