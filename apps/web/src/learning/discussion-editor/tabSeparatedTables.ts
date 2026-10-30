/**
 * Tables copied out of a document or a spreadsheet arrive as lines whose
 * cells are separated by tabs ("Feature\tany\tunknown"). Markdown has no
 * such table, so they ran together into one paragraph. Two or more such
 * lines in a row, each with the same number of cells (two or more) and none
 * starting with a tab (that is indented code), become a Markdown table whose
 * first line is the header. Fenced code blocks are left as they are.
 */
export function tabSeparatedTablesToMarkdown(markdown: string): string {
  if (!markdown.includes("\t")) return markdown;

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let fence: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      if (fence === null) fence = marker;
      else if (marker.startsWith(fence)) fence = null;
    }

    const columns = fence === null ? cellCount(line) : 0;
    let end = index;
    while (columns > 0 && cellCount(lines[end + 1] ?? "") === columns) end++;

    if (end > index) {
      const rows = lines.slice(index, end + 1).map(cells);
      const [header = [], ...body] = rows;
      output.push(
        tableRow(header),
        tableRow(header.map(() => "---")),
        ...body.map(tableRow),
      );
      index = end + 1;
      continue;
    }

    output.push(line);
    index++;
  }

  return output.join("\n");
}

function cells(line: string) {
  return line.split("\t").map((cell) => cell.trim());
}

/** The cells a tab-separated line has, or 0 when it is not one. */
function cellCount(line: string) {
  if (!line.includes("\t") || /^\s*\t/.test(line)) return 0;
  const row = cells(line);
  return row.length >= 2 && row[0] ? row.length : 0;
}

function tableRow(row: string[]) {
  return `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
}
