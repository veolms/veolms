/**
 * A CSV export of what a tab shows: one block per table, blank line
 * between. Built from the data the tab already has; nothing is fetched.
 */
export interface CsvSection {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function buildCsv(sections: CsvSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (lines.length > 0) lines.push("");
    lines.push(escapeCell(section.title));
    lines.push(section.headers.map(escapeCell).join(","));
    for (const row of section.rows) {
      lines.push(row.map(escapeCell).join(","));
    }
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, sections: CsvSection[]): void {
  const blob = new Blob([buildCsv(sections)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoked after the click has had its turn; revoking at once can cancel
  // the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
