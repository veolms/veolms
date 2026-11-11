import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FileArrowUpIcon as FileArrowUp } from "@phosphor-icons/react/FileArrowUp";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { LESSON_DOCUMENT_BODY_MAX_LENGTH } from "@veolms/contracts";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CourseDescriptionEditor } from "../CourseDescriptionEditor";
import { DiscussionMarkdown } from "../../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../../learning/discussion-editor/types";

/** A text file worth reading into the editor (2 MB of text is a book). */
const TEXT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The text files a document lesson takes. They become the reading's text,
 * to edit and format like text written here; a PDF is kept as a file.
 */
export const READING_TEXT_FILE_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
] as const;
export const READING_TEXT_MIME_TYPES = [
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "text/html",
] as const;

function isHtmlFile(file: File): boolean {
  return /\.html?$/i.test(file.name) || file.type === "text/html";
}

/** Whether a file is text the reading can take in (not a PDF to keep). */
export function isReadingTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    READING_TEXT_FILE_EXTENSIONS.some((extension) =>
      name.endsWith(extension),
    ) || (READING_TEXT_MIME_TYPES as readonly string[]).includes(file.type)
  );
}

/**
 * Reads a text file the creator chose into the reading's Markdown. Markdown
 * and plain text are taken as they are; a web page is turned into Markdown
 * (its scripts, styles and embeds dropped), so it is edited and shown like
 * any other reading. The file never leaves the browser: the text is saved
 * with the lesson.
 */
export async function readReadingTextFile(file: File): Promise<string> {
  if (file.size > TEXT_IMPORT_MAX_BYTES) {
    throw new Error("That file is too long to import (2 MB at most).");
  }
  const raw = (await file.text()).replace(/\r\n?/g, "\n");
  const text = isHtmlFile(file)
    ? (
        await import("../../learning/discussion-editor/clipboard")
      ).htmlToDiscussionMarkdown(raw)
    : raw.trim();
  if (!text) throw new Error("That file has no text to import.");
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
  /** A file dropped on the document's upload area, to import here. */
  pendingFile?: File | null;
  onPendingFileHandled?: () => void;
}

/**
 * The text of a document lesson, written with a formatting toolbar or
 * imported from a Markdown, text or HTML file, and read back in the Preview
 * tab exactly as learners will see it (the player's own renderer).
 */
export function LessonReadingEditor({
  id,
  value,
  onChange,
  disabled = false,
  onError,
  pendingFile = null,
  onPendingFileHandled,
}: LessonReadingEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  // Rendering a long reading should never hold up typing.
  const previewText = useDeferredValue(mode === "preview" ? value : "");
  const previewContent = useMemo(
    () => createDiscussionDraft(previewText),
    [previewText],
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // An import over written text keeps that text, to bring back.
  const [replaced, setReplaced] = useState<{
    fileName: string;
    previous: string;
  } | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const importFile = async (file: File) => {
    try {
      const text = await readReadingTextFile(file);
      const previous = valueRef.current;
      setReplaced(
        previous.trim() && previous !== text
          ? { fileName: file.name, previous }
          : null,
      );
      onChangeRef.current(text);
      setMode("write");
    } catch (error) {
      onErrorRef.current?.(
        error instanceof Error ? error.message : "That file could not be read.",
      );
    }
  };

  // A file dropped on the upload area is imported once, then let go of.
  const onPendingFileHandledRef = useRef(onPendingFileHandled);
  onPendingFileHandledRef.current = onPendingFileHandled;
  useEffect(() => {
    if (!pendingFile) return;
    onPendingFileHandledRef.current?.();
    // importFile reads everything it needs through refs.
    void importFile(pendingFile);
  }, [pendingFile]);

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
          title="Import a Markdown, text or HTML file"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-3 text-[0.74rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileArrowUp size={15} weight="bold" />
          <span>Import file</span>
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept={[
            ...READING_TEXT_FILE_EXTENSIONS,
            ...READING_TEXT_MIME_TYPES,
          ].join(",")}
          aria-label="Import a Markdown, text or HTML file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>

      <div className="p-3 sm:p-4">
        {replaced ? (
          <div
            role="status"
            className="mb-2.5 flex items-center justify-between gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[0.74rem] text-(--text)"
          >
            <span className="min-w-0 truncate">
              Imported {replaced.fileName} in place of your text.
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(replaced.previous);
                setReplaced(null);
                setMode("write");
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-semibold text-(--accent) hover:bg-(--hover) cursor-pointer"
            >
              <ArrowCounterClockwise size={13} weight="bold" />
              Restore previous text
            </button>
          </div>
        ) : null}
        {mode === "write" ? (
          <CourseDescriptionEditor
            id={id}
            label="Reading"
            placeholder="Write the reading for this lesson, or import a Markdown, text or HTML file. Use the toolbar for headings, lists, code and links."
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
