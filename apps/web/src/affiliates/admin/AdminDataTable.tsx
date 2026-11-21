import type { KeyboardEvent, ReactNode } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";

import { ElevatedCard } from "../../components/ElevatedCard";
import { OctopusIllustration } from "../../components/OctopusIllustration";
import { ThemedSelect } from "../../ThemedSelect";
import { ADMIN_PAGE_SIZES, type AdminPageSize } from "./useAdminListUrl";

export interface AdminColumn<Row> {
  id: string;
  header: string;
  /** Width and any "shown from" breakpoint, on the header and the cells. */
  className?: string;
  align?: "left" | "right";
  cell: (row: Row) => ReactNode;
  /** The placeholder bar's width while rows load. */
  skeleton?: string;
}

export interface AdminDataTableProps<Row extends { id: string }> {
  /** Names the list for assistive tech ("Affiliates"). */
  label: string;
  /** "affiliate", "affiliates" for the footer. */
  nouns: readonly [one: string, many: string];
  rows: readonly Row[];
  columns: readonly AdminColumn<Row>[];
  /** One row as a card, where there is no room for the table. */
  card: (row: Row) => ReactNode;
  total: number;
  page: number;
  pageCount: number;
  pageSize: AdminPageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: AdminPageSize) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: { status?: number } | null;
  onRetry: () => void;
  selectedId?: string | null;
  onOpen?: (id: string) => void;
  exportUrl?: string;
  isFiltered: boolean;
  onResetFilters: () => void;
  empty: { title: string; text: string };
}

const headCell =
  "px-3 py-3 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase";
const bone = "animate-pulse rounded bg-(--border)";
const SKELETON_ROWS = Array.from({ length: 8 }, (_, row) => row);
const PAGE_SIZE_OPTIONS = ADMIN_PAGE_SIZES.map(
  (size) => [String(size), `${size} a page`] as const,
);
const pageButton =
  "grid size-9 place-items-center rounded-lg border border-(--border) text-(--text) hover:bg-(--hover) disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-(--accent)";
const number = new Intl.NumberFormat("en-IN");

function openOnKey(event: KeyboardEvent, open: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open();
  }
}

/**
 * A page of a list, drawn as the Orders table is: a table where there is
 * room for one, cards where there is not (a phone, or the list beside an
 * open panel); placeholder rows while loading, a drawing when nothing
 * matches, and the range, Export CSV and the page buttons at the foot.
 */
export function AdminDataTable<Row extends { id: string }>(
  props: AdminDataTableProps<Row>,
) {
  const {
    label,
    nouns,
    rows,
    columns,
    card,
    total,
    page,
    pageCount,
    pageSize,
    onPageChange,
    onPageSizeChange,
    isLoading,
    isFetching,
    error,
    onRetry,
    selectedId,
    onOpen,
    exportUrl,
    isFiltered,
    onResetFilters,
    empty,
  } = props;

  if (error && rows.length === 0) {
    const forbidden = error.status === 403;
    return (
      <ElevatedCard as="div" role="alert" className="p-8 text-center sm:p-12">
        <WarningCircle
          size={32}
          weight="duotone"
          className="mx-auto mb-3 text-rose-500"
          aria-hidden="true"
        />
        <h2 className="m-0 text-base font-bold text-(--text)">
          {forbidden
            ? `You don't have access to ${nouns[1]}.`
            : `${label} could not be loaded.`}
        </h2>
        {!forbidden && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) hover:opacity-90"
          >
            <ArrowCounterClockwise size={15} aria-hidden="true" />
            Try again
          </button>
        )}
      </ElevatedCard>
    );
  }

  const showSkeleton = isLoading || (isFetching && rows.length === 0);

  if (!showSkeleton && rows.length === 0) {
    return (
      <ElevatedCard
        as="div"
        role="status"
        className="grid min-h-[22rem] place-items-center p-8 text-center sm:p-12"
      >
        <div>
          <OctopusIllustration
            kind="not-found"
            className="mx-auto mb-4 h-28 w-auto sm:h-32"
          />
          <h2 className="m-0 text-base font-bold text-(--text)">
            {isFiltered ? "Nothing matches these filters" : empty.title}
          </h2>
          <p className="m-0 mt-1 text-sm text-(--muted)">
            {isFiltered
              ? "Try a longer date range or fewer filters."
              : empty.text}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-(--border) px-4 text-sm font-semibold text-(--text) hover:bg-(--hover)"
            >
              <ArrowCounterClockwise size={15} aria-hidden="true" />
              Reset filters
            </button>
          )}
        </div>
      </ElevatedCard>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, first + rows.length - 1);

  return (
    <ElevatedCard
      as="section"
      aria-label={label}
      className="@container overflow-hidden p-0"
    >
      <div
        aria-busy={showSkeleton || isFetching || undefined}
        className={
          isFetching && !showSkeleton ? "opacity-70 transition-opacity" : ""
        }
      >
        <table className="hidden w-full table-fixed border-collapse @3xl:table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.id}
                  scope="col"
                  className={`${headCell} ${column.align === "right" ? "text-right" : "text-left"} ${index === 0 ? "pl-4" : ""} ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
              {onOpen && (
                <th scope="col" className="w-10">
                  <span className="sr-only">Open</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? SKELETON_ROWS.map((row) => (
                  <tr
                    key={row}
                    aria-hidden="true"
                    className="h-[4.25rem] border-t border-(--border)"
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.id}
                        className={`px-3 py-2.5 ${index === 0 ? "pl-4" : ""} ${column.className ?? ""}`}
                      >
                        <div
                          className={`${bone} h-3.5 max-w-full ${column.skeleton ?? "w-16"} ${column.align === "right" ? "ml-auto" : ""}`}
                        />
                      </td>
                    ))}
                    {onOpen && <td />}
                  </tr>
                ))
              : rows.map((row) => {
                  const selected = row.id === selectedId;
                  const open = onOpen ? () => onOpen(row.id) : undefined;
                  return (
                    <tr
                      key={row.id}
                      tabIndex={open ? 0 : undefined}
                      aria-selected={open ? selected : undefined}
                      onClick={open}
                      onKeyDown={
                        open ? (event) => openOnKey(event, open) : undefined
                      }
                      className={`h-[4.25rem] border-t border-(--border) transition-colors outline-none ${
                        open
                          ? "cursor-pointer hover:bg-(--hover) focus-visible:bg-(--hover) focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
                          : ""
                      } ${
                        selected
                          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[inset_0_0_0_1.5px_var(--accent)]"
                          : ""
                      }`}
                    >
                      {columns.map((column, index) => (
                        <td
                          key={column.id}
                          className={`px-3 py-2.5 ${index === 0 ? "pl-4" : ""} ${column.align === "right" ? "text-right tabular-nums" : ""} ${column.className ?? ""}`}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                      {open && (
                        <td className="py-2.5 pr-4 pl-1 text-right">
                          <CaretRight
                            size={14}
                            weight="bold"
                            aria-hidden="true"
                            className="inline text-(--muted)"
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
          </tbody>
        </table>

        <ul className="m-0 list-none divide-y divide-(--border) p-0 @3xl:hidden">
          {showSkeleton
            ? SKELETON_ROWS.map((row) => (
                <li
                  key={row}
                  aria-hidden="true"
                  className="flex flex-col gap-2.5 px-4 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`${bone} size-9 shrink-0 rounded-full`} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className={`${bone} h-3.5 w-28`} />
                      <div className={`${bone} h-3 w-24`} />
                    </div>
                    <div className={`${bone} h-5.5 w-16 rounded-full`} />
                  </div>
                </li>
              ))
            : rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    {onOpen ? (
                      <button
                        type="button"
                        aria-current={selected || undefined}
                        onClick={() => onOpen(row.id)}
                        className={`flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-(--hover) focus-visible:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${
                          selected
                            ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                            : ""
                        }`}
                      >
                        {card(row)}
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 px-4 py-3.5">
                        {card(row)}
                      </div>
                    )}
                  </li>
                );
              })}
        </ul>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-(--border) px-4 py-3">
        <p
          className="m-0 text-sm text-(--muted) tabular-nums"
          aria-live="polite"
        >
          {showSkeleton
            ? `Loading ${nouns[1]}…`
            : `${number.format(first)}–${number.format(last)} of ${number.format(total)} ${total === 1 ? nouns[0] : nouns[1]}`}
        </p>
        {exportUrl && (
          <a
            href={exportUrl}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-(--accent) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <DownloadSimple size={15} weight="bold" aria-hidden="true" />
            Export CSV
          </a>
        )}
        <nav aria-label="Pages" className="ml-auto flex items-center gap-2">
          <div className="hidden rounded-lg border border-(--border) px-2 sm:block">
            <ThemedSelect
              id={`${label.toLowerCase().replace(/\s+/g, "-")}-page-size`}
              ariaLabel="Rows a page"
              value={String(pageSize)}
              options={PAGE_SIZE_OPTIONS}
              onValueChange={(value) =>
                onPageSizeChange(Number(value) as AdminPageSize)
              }
              triggerClassName="min-h-9! p-0! bg-transparent! shadow-none! border-0! text-sm text-(--text-secondary)"
            />
          </div>
          <span className="text-sm text-(--muted) tabular-nums">
            Page {page} of {Math.max(1, pageCount)}
          </span>
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1 || showSkeleton}
            onClick={() => onPageChange(page - 1)}
            className={pageButton}
          >
            <CaretLeft size={14} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pageCount || showSkeleton}
            onClick={() => onPageChange(page + 1)}
            className={pageButton}
          >
            <CaretRight size={14} weight="bold" aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </ElevatedCard>
  );
}
