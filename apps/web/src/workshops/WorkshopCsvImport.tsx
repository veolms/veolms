import { useRef, useState, type ChangeEvent } from "react";
import {
  WORKSHOP_IMPORT_MAX_ROWS,
  type ImportWorkshopRegistrantsResponse,
} from "@veolms/contracts";
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
