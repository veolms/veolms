import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ChatAttachment } from "@veolms/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useBackDismiss } from "../navigation/useBackDismiss";
import { chatService } from "../services/chat";
import { formatBytes } from "./chatFormat";

/** Read as text in the preview: at most this much (bigger: download). */
const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const CSV_PREVIEW_ROWS = 500;

type PreviewKind = "pdf" | "text" | "csv" | null;

/** What the preview can show for a document (WhatsApp, Telegram). */
export function previewKind(attachment: ChatAttachment): PreviewKind {
  const type = attachment.mimeType;
  if (type === "application/pdf") return "pdf";
  if (attachment.size > TEXT_PREVIEW_MAX_BYTES) return null;
  if (type === "text/csv") return "csv";
  if (
    type === "text/plain" ||
    type === "text/markdown" ||
    type === "application/json"
  ) {
    return "text";
  }
  return null;
}

/** One CSV line into cells ("quoted, values" kept whole). */
function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/**
 * A document full screen, as WhatsApp and Telegram open one: PDFs in the
 * browser's own viewer, text, Markdown and JSON as text, CSV as a table;
 * anything else says so and offers the download. Esc or Back closes it.
 */
export function FilePreview({
  attachment,
  onClose,
}: {
  attachment: ChatAttachment;
  onClose: () => void;
}) {
  useBackDismiss({ open: true, onDismiss: onClose });
  const kind = previewKind(attachment);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Text is read through a short-lived link (no cookies to the store).
  useEffect(() => {
    if (kind !== "text" && kind !== "csv") return;
    const controller = new AbortController();
    void chatService
      .readFileText(attachment, controller.signal)
      .then(setText)
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [attachment, kind]);

  const control =
    "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20";
  const rows =
    kind === "csv" && text !== null
      ? text
          .split(/\r?\n/)
          .filter((line) => line.length > 0)
          .slice(0, CSV_PREVIEW_ROWS + 1)
          .map(csvCells)
      : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      className="fixed inset-0 z-300 flex flex-col bg-black/92"
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {attachment.name}
          </span>
          <span className="block text-[0.75rem] text-white/60">
            {formatBytes(attachment.size)}
          </span>
        </span>
        <a
          href={chatService.fileUrl(attachment, true)}
          className={control}
          aria-label="Download"
          download={attachment.name}
        >
          <DownloadSimple size={20} />
        </a>
        <button
          type="button"
          className={control}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center px-2 pb-2 sm:px-6 sm:pb-6">
        {kind === "pdf" ? (
          <iframe
            title={attachment.name}
            src={chatService.fileUrl(attachment)}
            className="size-full max-w-5xl rounded-lg border-0 bg-white"
          />
        ) : kind === null || failed ? (
          <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center text-white">
            <FileText size={56} weight="duotone" aria-hidden="true" />
            <p className="m-0 text-[0.95rem]">
              {failed
                ? "This file couldn’t be opened here."
                : "No preview for this kind of file."}
            </p>
            <a
              href={chatService.fileUrl(attachment, true)}
              download={attachment.name}
              className="rounded-full bg-white px-5 py-2.5 text-[0.88rem] font-semibold text-black no-underline"
            >
              Download
            </a>
          </div>
        ) : text === null ? (
          <div className="mt-10 h-1 w-40 animate-pulse rounded bg-white/30" />
        ) : rows ? (
          <div className="size-full max-w-5xl overflow-auto rounded-lg bg-white text-[0.82rem] text-slate-900">
            <table className="w-full border-collapse">
              <tbody>
                {rows.map((cells, r) => (
                  <tr
                    key={r}
                    className={
                      r === 0 ? "sticky top-0 bg-slate-100 font-semibold" : ""
                    }
                  >
                    {cells.map((cell, c) => (
                      <td
                        key={c}
                        className="border border-solid border-slate-200 px-2 py-1 whitespace-nowrap"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <pre className="m-0 size-full max-w-5xl overflow-auto rounded-lg bg-[#0d1117] p-4 font-mono text-[0.82rem] leading-relaxed whitespace-pre-wrap text-slate-100">
            {attachment.mimeType === "application/json"
              ? prettyJson(text)
              : text}
          </pre>
        )}
      </div>
    </div>,
    document.body,
  );
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
