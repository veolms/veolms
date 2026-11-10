import { useRef, useState, type ChangeEvent } from "react";
import {
  WORKSHOP_IMPORT_MAX_ROWS,
  type ImportWorkshopRegistrantsResponse,
} from "@veolms/contracts";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileCsvIcon as FileCsv } from "@phosphor-icons/react/FileCsv";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { getApiError } from "../lib/api-error";
import { useImportWorkshopRegistrants } from "../services/workshops";

const REASON_LABEL: Record<
  ImportWorkshopRegistrantsResponse["skipped"][number]["reason"],
  string
> = {
  invalid_email: "not a valid email",
  no_account: "no account",
  deleted_account: "a deleted account",
  duplicate: "repeated in the file",
};

/** What a file to import looks like: shown, and offered as a download. */
const SAMPLE_ROWS: readonly (readonly [string, string])[] = [
  ["email", "name"],
  ["asha.rao@example.com", "Asha Rao"],
  ["vikram.s@example.com", "Vikram Singh"],
  ["meera@example.com", ""],
];
const SAMPLE_CSV =
  SAMPLE_ROWS.map((row) => row.join(",")).join("\r\n") + "\r\n";
const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

/** Splits one CSV line, honouring double quotes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === "," || char === ";" || char === "\t") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Reads email and name columns from a spreadsheet export. A header row is
 * used when it names an "email" column (and a "name" one); otherwise the
 * first cell holding an @ is the email and the cell after it the name.
 */
export function parseAttendeeCsv(
  text: string,
): { email: string; name?: string }[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!).map((cell) => cell.toLowerCase());
  const emailColumn = header.findIndex((cell) =>
    /^(e-?mail|email address)$/.test(cell),
  );
  const nameColumn = header.findIndex((cell) =>
    /^(name|full name|display name)$/.test(cell),
  );
  const rows = emailColumn >= 0 ? lines.slice(1) : lines;
  return rows.map((line) => {
    const cells = splitCsvLine(line);
    if (emailColumn >= 0) {
      const name = nameColumn >= 0 ? cells[nameColumn] : undefined;
      return { email: cells[emailColumn] ?? "", ...(name ? { name } : {}) };
    }
    const at = cells.findIndex((cell) => cell.includes("@"));
    const email = at >= 0 ? cells[at]! : (cells[0] ?? "");
    const name = at >= 0 ? cells[at + 1] : undefined;
    return { email, ...(name ? { name } : {}) };
  });
}

/**
 * One "Import CSV" button. Emails without an account get a student account
 * (they sign in with an emailed code). Meant for a wrapping flex row: the
 * result line takes a row of its own under the buttons.
 */
export function WorkshopCsvImport({ workshopId }: { workshopId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importRows = useImportWorkshopRegistrants();
  const [problem, setProblem] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [result, setResult] =
    useState<ImportWorkshopRegistrantsResponse | null>(null);

  const start = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    setResult(null);
    const rows = parseAttendeeCsv(await file.text());
    if (rows.length === 0) {
      setProblem("The file has no rows. Put one email per row.");
      return;
    }
    if (rows.length > WORKSHOP_IMPORT_MAX_ROWS) {
      setProblem(
        `The file has ${rows.length} rows; one import takes at most ${WORKSHOP_IMPORT_MAX_ROWS}. Split it into smaller files.`,
      );
      return;
    }
    importRows.mutate(
      { workshopId, rows, createAccounts: true },
      {
        onSuccess: (response) => setResult(response),
        onError: (error) =>
          setProblem(
            getApiError(error)?.message ?? "The file could not be imported.",
          ),
      },
    );
  };

  const skipped = result?.skipped ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importRows.isPending}
        title="A CSV with an email column and, optionally, a name column"
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-(--surface-strong) px-3.5 text-[13px] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) disabled:opacity-60"
      >
        <UploadSimple size={15} />
        {importRows.isPending ? "Importing..." : "Import CSV"}
      </button>
      <button
        type="button"
        onClick={() => setShowFormat((open) => !open)}
        aria-expanded={showFormat}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
      >
        <FileCsv size={15} />
        CSV format
      </button>
      {showFormat ? (
        <div className="grid basis-full gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5">
          <p className="text-[13px] text-(--muted)">
            One person per row. The first row names the columns:{" "}
            <span className="font-semibold text-(--text)">email</span>{" "}
            (required) and{" "}
            <span className="font-semibold text-(--text)">name</span>{" "}
            (optional). Up to {WORKSHOP_IMPORT_MAX_ROWS.toLocaleString("en-IN")}{" "}
            rows per file. Emails without an account get one; they sign in with
            a code sent to that email.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <table className="w-full min-w-[320px] border-collapse text-left font-mono text-xs">
              <thead className="bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-(--muted)">
                <tr>
                  {SAMPLE_ROWS[0]!.map((cell) => (
                    <th
                      key={cell}
                      scope="col"
                      className="px-3 py-2 font-semibold"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--text)">
                {SAMPLE_ROWS.slice(1).map((row) => (
                  <tr key={row[0]}>
                    <td className="px-3 py-2">{row[0]}</td>
                    <td className="px-3 py-2 text-(--muted)">
                      {row[1] || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a
            href={SAMPLE_HREF}
            download="workshop-attendees-sample.csv"
            className="inline-flex h-9 w-fit items-center gap-2 rounded-xl bg-(--surface-strong) px-3.5 text-[13px] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
          >
            <DownloadSimple size={15} />
            Download sample CSV
          </a>
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(event) => void start(event)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      {problem ? (
        <p className="basis-full text-sm text-rose-500" role="alert">
          {problem}
        </p>
      ) : null}
      {result ? (
        <p className="basis-full text-[13px] text-(--muted)" role="status">
          {result.added} added
          {result.accountsCreated > 0
            ? ` (${result.accountsCreated} new accounts)`
            : ""}
          , {result.alreadyRegistered} already in
          {skipped.length > 0
            ? `, ${skipped.length} skipped: ${skipped
                .slice(0, 5)
                .map(
                  (entry) =>
                    `${entry.email || `row ${entry.row}`} (${REASON_LABEL[entry.reason]})`,
                )
                .join(", ")}${skipped.length > 5 ? "…" : ""}`
            : ""}
          .
        </p>
      ) : null}
    </>
  );
}
