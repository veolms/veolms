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
 * Registers a whole list at once from a CSV file. People without an account
 * get a student account (they sign in with an emailed code) unless the box
 * is unticked; everyone added gets the usual confirmation and reminders.
 */
export function WorkshopCsvImport({ workshopId }: { workshopId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importRows = useImportWorkshopRegistrants();
  const [createAccounts, setCreateAccounts] = useState(true);
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
      { workshopId, rows, createAccounts },
      {
        onSuccess: (response) => setResult(response),
        onError: (error) =>
          setProblem(
            getApiError(error)?.message ?? "The file could not be imported.",
          ),
      },
    );
  };

  return (
    <div className="grid gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-(--text)">
            Import from a spreadsheet
          </p>
          <p className="text-xs text-(--muted)">
            A CSV with an email column and, if you like, a name column.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={importRows.isPending}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-(--surface-strong) px-3.5 text-[13px] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) disabled:opacity-60"
        >
          <UploadSimple size={15} />
          {importRows.isPending ? "Importing..." : "Import CSV"}
        </button>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-(--text)">
        <input
          type="checkbox"
          checked={createAccounts}
          onChange={(event) => setCreateAccounts(event.target.checked)}
          className="mt-0.5 size-4 accent-(--accent)"
        />
        <span>
          Create an account for emails that have none (they sign in with an
          emailed code)
        </span>
      </label>
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
        <p className="text-sm text-rose-500" role="alert">
          {problem}
        </p>
      ) : null}
      {result ? (
        <div className="grid gap-1 text-[13px] text-(--text)" role="status">
          <p>
            {result.added} added
            {result.accountsCreated > 0
              ? ` (${result.accountsCreated} new accounts)`
              : ""}
            , {result.alreadyRegistered} already registered
            {result.skipped.length > 0
              ? `, ${result.skipped.length} skipped`
              : ""}
            .
          </p>
          {result.skipped.length > 0 ? (
            <ul className="max-h-32 overflow-auto text-xs text-(--muted)">
              {result.skipped.slice(0, 50).map((entry) => (
                <li key={`${entry.row}-${entry.email}`}>
                  Row {entry.row}: {entry.email || "(empty)"} —{" "}
                  {REASON_LABEL[entry.reason]}
                </li>
              ))}
              {result.skipped.length > 50 ? (
                <li>…and {result.skipped.length - 50} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
