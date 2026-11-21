import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import type { ChatAttachment } from "@veolms/contracts";
import { useEffect, useState } from "react";

import { HighlightedCodeBlock } from "../components/code/HighlightedCodeBlock";
import { chatService } from "../services/chat";
import { formatBytes } from "./chatFormat";
import { PdfPages } from "./PdfPages";

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
 * A document inside the media viewer, as WhatsApp opens one: a PDF's pages
 * drawn one under another (PdfPages), text, Markdown and JSON as coloured
 * text, CSV as a table; anything else says so and offers the download.
 */
export function DocumentView({ attachment }: { attachment: ChatAttachment }) {
  const kind = previewKind(attachment);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (kind === "pdf") return <PdfPages attachment={attachment} />;

  const rows =
    kind === "csv" && text !== null
      ? text
          .split(/\r?\n/)
          .filter((line) => line.length > 0)
          .slice(0, CSV_PREVIEW_ROWS + 1)
          .map(csvCells)
      : null;

  return (
    <div className="flex size-full justify-center px-2 pb-2 sm:px-16 sm:pb-6">
      {kind === null || failed ? (
        <NoPreview attachment={attachment} failed={failed} />
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
        // Coloured like code in comments and messages: by the file's
        // type or name, else by what the text looks like.
        <div className="size-full max-w-5xl overflow-auto rounded-xl">
          <HighlightedCodeBlock
            className="my-0 min-h-full"
            language={fileLanguage(attachment)}
            code={
              attachment.mimeType === "application/json"
                ? prettyJson(text)
                : text
            }
          />
        </div>
      )}
    </div>
  );
}

/** A file this viewer can't show: its type, size and the download. */
export function NoPreview({
  attachment,
  failed = false,
}: {
  attachment: ChatAttachment;
  failed?: boolean;
}) {
  return (
    <div className="flex size-full max-w-sm flex-col items-center justify-center gap-3 self-center text-center text-white">
      <FileText size={56} weight="duotone" aria-hidden="true" />
      <p className="m-0 text-[0.95rem] font-semibold break-all">
        {attachment.name}
      </p>
      <p className="m-0 text-[0.85rem] text-white/70">
        {failed
          ? "This file couldn’t be opened here."
          : `No preview for this kind of file · ${formatBytes(attachment.size)}`}
      </p>
      <a
        href={chatService.fileUrl(attachment, true)}
        download={attachment.name}
        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[0.88rem] font-semibold text-black no-underline"
      >
        <DownloadSimple size={18} aria-hidden="true" />
        Download
      </a>
    </div>
  );
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  js: "js",
  mjs: "js",
  cjs: "js",
  jsx: "jsx",
  ts: "ts",
  tsx: "tsx",
  py: "py",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "cs",
  go: "go",
  rs: "rs",
  rb: "rb",
  php: "php",
  sh: "sh",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  json: "json",
  md: "md",
};

/** The language to colour a text file as; undefined lets the text decide. */
function fileLanguage(attachment: ChatAttachment): string | undefined {
  if (attachment.mimeType === "application/json") return "json";
  if (attachment.mimeType === "text/markdown") return "md";
  const extension = /\.([a-z0-9]+)$/i.exec(attachment.name)?.[1];
  return extension ? EXTENSION_LANGUAGES[extension.toLowerCase()] : undefined;
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
