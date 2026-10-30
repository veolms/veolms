import type { ReactNode } from "react";
import { TableIcon as Table } from "@phosphor-icons/react/Table";
import { EmptyState } from "./surfaces";
import { KPI_TONE_CLASSES, toneForIndex } from "./tones";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Not shown under 640px; the first column always is. */
  hideOnPhone?: boolean;
  render: (row: Row, index: number) => ReactNode;
  /** The plain value for a CSV export; the rendered text when omitted. */
  exportValue?: (row: Row) => string | number;
}

/**
 * The one table every tab uses: hairline rows, numeric columns right
 * aligned, horizontal scroll on narrow screens. Rows are given, not
 * sorted here: the API already ranks them.
 */
export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  emptyTitle = "Nothing to show yet",
  emptyMessage = "This will fill in once there's activity in the selected range.",
  footer,
  dense = false,
}: {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  rowKey: (row: Row) => string;
  emptyTitle?: string;
  emptyMessage?: string;
  /** A last row, for totals; one cell per column. */
  footer?: ReactNode[];
  dense?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Table size={20} weight="bold" />}
        title={emptyTitle}
        message={emptyMessage}
        compact
      />
    );
  }
  const cellPadding = dense ? "py-1.5 pr-3" : "py-2.5 pr-3";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`py-2 pr-3 text-[0.68rem] sm:text-xs font-medium whitespace-nowrap ${
                  column.numeric ? "text-right" : ""
                } ${column.hideOnPhone ? "max-sm:hidden" : ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`${cellPadding} ${
                    column.numeric
                      ? "text-right text-(--muted) tabular-nums whitespace-nowrap"
                      : ""
                  } ${column.hideOnPhone ? "max-sm:hidden" : ""}`}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot>
            <tr className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] font-semibold text-(--text)">
              {footer.map((cell, index) => {
                const column = columns[index];
                return (
                  <td
                    key={column?.key ?? index}
                    className={`pt-2.5 pr-3 ${
                      column?.numeric ? "text-right tabular-nums" : ""
                    } ${column?.hideOnPhone ? "max-sm:hidden" : ""}`}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function titleInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!;
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1]!;
  return (first[0]! + second[0]!).toUpperCase();
}

/** A title cell with an initials chip, for course and product rows. */
export function TitleCell({
  title,
  index,
  subtitle,
}: {
  title: string;
  index: number;
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={`flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg text-[0.6rem] sm:text-[0.65rem] font-bold ${KPI_TONE_CLASSES[toneForIndex(index)]}`}
      >
        {titleInitials(title)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-(--text)">
          {title}
        </span>
        {subtitle ? (
          <span className="block truncate text-[0.68rem] text-(--muted)">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** A thin progress bar with its percentage, for a table cell. */
export function ProgressCell({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-14 sm:w-20 shrink-0 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
        <div
          className="h-full rounded-full bg-(--accent)"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-(--muted) tabular-nums">
        {Math.round(percent)}%
      </span>
    </div>
  );
}
