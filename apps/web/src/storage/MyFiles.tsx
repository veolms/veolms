import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MicrophoneIcon as Microphone } from "@phosphor-icons/react/Microphone";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  formatStorageBytes,
  type StorageFile,
  type StorageFileKind,
  type StorageFileKindTotal,
  type StorageFileSort,
} from "@veolms/contracts";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../components/Button";
import {
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../components/FilterBar";
import { FilterChips } from "../components/FilterChips";
import { useDebounce } from "../hooks/useDebounce";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useDeleteMyFiles, useMyStorageFiles } from "../services/storage";
import { ThemedSelect } from "../ThemedSelect";
import { StorageDialog } from "./StorageDialog";
import { storageFileUrl, StorageFilePreview } from "./StorageFilePreview";

type KindFilter = StorageFileKind | "all";

export const KIND_LABELS: Record<StorageFileKind, string> = {
  image: "Photos",
  video: "Videos",
  audio: "Voice and audio",
  file: "Documents",
};

/** The chips' shorter words, so the row fits a phone. */
const CHIP_LABELS: Record<StorageFileKind, string> = {
  image: "Photos",
  video: "Videos",
  audio: "Voice",
  file: "Documents",
};

/** Each kind's share of the bar: the accent, lighter kind by kind. */
export const KIND_FILLS: Record<StorageFileKind, string> = {
  image: "bg-(--accent)",
  video: "bg-[color-mix(in_srgb,var(--accent)_68%,var(--surface))]",
  audio: "bg-[color-mix(in_srgb,var(--accent)_42%,var(--surface))]",
  file: "bg-[color-mix(in_srgb,var(--accent)_22%,var(--surface))]",
};

const SORTS = [
  ["largest", "Largest"],
  ["newest", "Newest"],
  ["oldest", "Oldest"],
] as const satisfies ReadonlyArray<readonly [StorageFileSort, string]>;

const keyOf = (file: Pick<StorageFile, "source" | "id">) =>
  `${file.source}:${file.id}`;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function duration(ms: number | null) {
  if (!ms) return null;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** What the files of each kind take, as one bar and its legend. */
export function KindBreakdown({
  kinds,
}: {
  kinds: readonly StorageFileKindTotal[];
}) {
  const total = kinds.reduce((sum, kind) => sum + kind.bytes, 0);
  if (total === 0) return null;
  return (
    <div className="grid gap-2">
      <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 text-[0.74rem] @[340px]/files:grid-cols-2">
        {kinds.map((kind) => (
          <li key={kind.kind} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                KIND_FILLS[kind.kind],
              )}
            />
            <span className="truncate text-(--muted)">
              {KIND_LABELS[kind.kind]}
            </span>
            <span className="ml-auto font-semibold text-(--text) tabular-nums">
              {formatStorageBytes(kind.bytes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One file's square: its picture, or an icon with its name. */
function FileTile({
  file,
  selected,
  selecting,
  onToggle,
  onOpen,
}: {
  file: StorageFile;
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const url = storageFileUrl(file);
  const length = duration(file.durationMs);
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--text)_7%,transparent)] transition-shadow",
        selected &&
          "ring-2 ring-(--accent) ring-offset-2 ring-offset-(--surface)",
      )}
    >
      <button
        type="button"
        onClick={selecting ? onToggle : onOpen}
        aria-label={`${selecting ? (selected ? "Unselect" : "Select") : "Open"} ${file.name}, ${formatStorageBytes(file.size)}`}
        className="block size-full cursor-pointer border-0 bg-transparent p-0 text-left"
      >
        {file.kind === "image" && url ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center text-(--muted)">
            {file.kind === "video" ? (
              <Play size={26} weight="fill" />
            ) : file.kind === "audio" ? (
              <Microphone size={26} weight="fill" />
            ) : (
              <FileText size={26} weight="fill" />
            )}
            <span className="line-clamp-2 w-full text-[0.68rem] leading-tight break-all text-(--text-secondary)">
              {file.name}
            </span>
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-linear-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[0.66rem] font-semibold text-white tabular-nums">
          <span>{formatStorageBytes(file.size)}</span>
          {length ? <span>{length}</span> : null}
        </span>
      </button>
      {/* Selecting is always one tap away (WhatsApp's circle). */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${file.name}`}
        onClick={onToggle}
        className={cn(
          "absolute top-1.5 right-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-full border-2 border-solid border-white p-0 text-(--on-accent) shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-[background-color,opacity]",
          selected ? "bg-(--accent)" : "bg-black/25",
          // With a mouse the circle shows on hover, while selecting, or on
          // a chosen file; touch screens always show it.
          !selecting &&
            !selected &&
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100",
        )}
      >
        {selected ? <Check size={13} weight="bold" /> : null}
      </button>
    </div>
  );
}

/**
 * The learner's own files that take space (WhatsApp's "Manage storage"):
 * every photo, video, voice message and document they sent in chats,
 * discussions and support, biggest first, with a preview, one or many
 * selected (or all of them) and deleted at once. A chat message whose file
 * is deleted stays and says the file was deleted.
 */
export function MyFiles({ onToast }: { onToast?: (message: string) => void }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<StorageFileSort>("largest");
  const [selected, setSelected] = useState<Map<string, StorageFile>>(
    () => new Map(),
  );
  const [confirming, setConfirming] = useState<StorageFile[] | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Searched on the server, so paging, the chips' counts and "Select all"
  // count only the files that match.
  const [query, setQuery] = useState("");
  const search = useDebounce(query.trim(), 250);
  const files = useMyStorageFiles(sort, kind === "all" ? null : kind, search);
  // A new search or kind starts a new selection: what is chosen is always
  // among the files shown.
  useEffect(() => {
    setSelected(new Map());
  }, [search, kind]);
  const remove = useDeleteMyFiles();

  const list = useMemo(
    () => files.data?.pages.flatMap((page) => page.files) ?? [],
    [files.data],
  );
  const first = files.data?.pages[0];
  const kinds = first?.kinds ?? [];
  const total = first?.total ?? 0;
  const counts = Object.fromEntries(
    kinds.map((entry) => [entry.kind, entry.count]),
  ) as Partial<Record<StorageFileKind, number>>;
  const everything = kinds.reduce((sum, entry) => sum + entry.count, 0);
  const chosen = [...selected.values()];
  const chosenBytes = chosen.reduce((sum, file) => sum + file.size, 0);
  const selecting = chosen.length > 0;
  const allLoadedChosen =
    list.length > 0 && list.every((file) => selected.has(keyOf(file)));

  // The page's toast when it has one (Chats), else a line above the files.
  const tell = (message: string) => {
    if (onToast) onToast(message);
    else setNotice(message);
  };
  const toggle = (file: StorageFile) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(keyOf(file))) next.delete(keyOf(file));
      else next.set(keyOf(file), file);
      return next;
    });
  const selectAll = async () => {
    // "Select all" means every file shown by the filter, not only the ones
    // loaded so far: the rest are loaded first.
    let pages = files.data?.pages ?? [];
    let more = files.hasNextPage;
    while (more) {
      const result = await files.fetchNextPage();
      pages = result.data?.pages ?? pages;
      more = Boolean(result.hasNextPage);
    }
    setSelected(
      new Map(
        pages.flatMap((page) => page.files).map((file) => [keyOf(file), file]),
      ),
    );
  };
  const confirmDelete = (targets: StorageFile[]) => {
    setNotice(null);
    setConfirming(targets);
  };
  const runDelete = (targets: StorageFile[]) => {
    remove.mutate(
      targets.map(({ source, id }) => ({ source, id })),
      {
        onSuccess: (result) => {
          setConfirming(null);
          setPreviewing(null);
          setSelected(new Map());
          tell(
            result.deleted === 0
              ? "Those files were already deleted."
              : `${result.deleted === 1 ? "1 file" : `${result.deleted} files`} deleted. ${formatStorageBytes(result.freedBytes)} freed.`,
          );
        },
        onError: (error) => tell(getApiError(error).message),
      },
    );
  };

  const chips = [
    { id: "all" as const, label: "All", count: everything },
    ...(["image", "video", "audio", "file"] as const).map((id) => ({
      id,
      label: CHIP_LABELS[id],
      count: counts[id] ?? 0,
    })),
  ];

  return (
    <section
      aria-label="Your files"
      // Laid out by its own width: it sits in Chats' narrow list panel as
      // well as in a wide sheet.
      className="@container/files grid min-w-0 gap-3"
    >
      {search ? null : <KindBreakdown kinds={kinds} />}

      {/* Search and order, side by side as in the app's other filter bars. */}
      <div className="flex min-w-0 items-center gap-2">
        <label
          className={cn(
            filterControlClasses,
            "min-h-10 min-w-0 flex-1 cursor-text gap-2",
          )}
        >
          <MagnifyingGlass
            size={16}
            className="shrink-0 text-(--muted)"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Search files"
            aria-label="Search your files by name, chat, lesson or kind"
            enterKeyHint="search"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-[0.84rem] text-(--text) placeholder-(--muted) outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
        <div className={cn(filterControlClasses, "min-h-10 w-28 shrink-0")}>
          <ThemedSelect
            id="my-files-sort"
            value={sort}
            onValueChange={(value) => setSort(value as StorageFileSort)}
            options={SORTS}
            ariaLabel="Sort files"
            triggerClassName={`${filterSelectTriggerClasses} min-h-10! w-full`}
          />
        </div>
      </div>

      {/* The kinds: they wrap onto a second line in a narrow panel, so
          none is ever cut off. */}
      <FilterChips
        ariaLabel="Show files"
        value={kind}
        onChange={setKind}
        items={chips}
        wrap
      />

      {/* What is shown or selected, and what to do with it: one line. */}
      <div
        className={cn(
          "flex min-h-10 items-center gap-2 rounded-xl text-[0.8rem]",
          selecting
            ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] py-1 pr-1 pl-3 text-(--text)"
            : "px-1 text-(--muted)",
        )}
        aria-live="polite"
      >
        <span className="min-w-0 flex-1 truncate">
          {selecting ? (
            <>
              <strong className="font-semibold">
                {chosen.length} selected
              </strong>{" "}
              · {formatStorageBytes(chosenBytes)}
            </>
          ) : total > 0 ? (
            `${total} ${total === 1 ? "file" : "files"} · ${formatStorageBytes(first?.totalBytes ?? 0)}`
          ) : null}
        </span>
        {total > 0 ? (
          <button
            type="button"
            onClick={() =>
              allLoadedChosen && !files.hasNextPage
                ? setSelected(new Map())
                : void selectAll()
            }
            disabled={files.isFetchingNextPage}
            className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-[0.8rem] font-semibold whitespace-nowrap text-(--accent-ink) hover:bg-(--hover) disabled:opacity-55"
          >
            {allLoadedChosen && !files.hasNextPage
              ? "Unselect all"
              : "Select all"}
          </button>
        ) : null}
        {selecting ? (
          <Button
            variant="danger"
            elevation="flat"
            className="h-8 shrink-0 gap-1.5 px-3 text-[0.8rem]!"
            onClick={() => confirmDelete(chosen)}
          >
            <Trash size={15} aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className="m-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-[0.78rem] text-(--text)"
        >
          {notice}
        </p>
      ) : null}

      {files.isLoading ? (
        <div
          className="grid grid-cols-3 gap-2 @[480px]/files:grid-cols-4"
          aria-busy="true"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--text)_7%,transparent)]"
            />
          ))}
        </div>
      ) : files.isError ? (
        <p className="m-0 py-4 text-center text-[0.8rem] text-(--muted)">
          Couldn’t load your files.{" "}
          <button
            type="button"
            onClick={() => void files.refetch()}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent-ink) hover:underline"
          >
            Try again
          </button>
        </p>
      ) : list.length === 0 ? (
        <div className="grid justify-items-center gap-2 py-6 text-center text-[0.82rem] text-(--muted)">
          <p className="m-0 break-words">
            {search
              ? `No files match “${search}”${kind === "all" ? "" : ` in ${KIND_LABELS[kind].toLowerCase()}`}.`
              : kind === "all"
                ? "You haven’t sent any files yet."
                : `No ${KIND_LABELS[kind].toLowerCase()}.`}
          </p>
          {search ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-[0.8rem] font-semibold text-(--accent-ink) hover:bg-(--hover)"
            >
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 @[480px]/files:grid-cols-4">
          {list.map((file, index) => (
            <li key={keyOf(file)} className="min-w-0">
              <FileTile
                file={file}
                selected={selected.has(keyOf(file))}
                selecting={selecting}
                onToggle={() => toggle(file)}
                onOpen={() => setPreviewing(index)}
              />
            </li>
          ))}
        </ul>
      )}

      {files.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="quiet"
            elevation="flat"
            className="h-9 text-[0.8rem]!"
            disabled={files.isFetchingNextPage}
            onClick={() => void files.fetchNextPage()}
          >
            {files.isFetchingNextPage ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}

      {previewing !== null && list[previewing] ? (
        <StorageFilePreview
          files={list}
          index={previewing}
          onIndex={setPreviewing}
          onClose={() => setPreviewing(null)}
          onDelete={(file) => confirmDelete([file])}
          formatWhen={(file) =>
            [file.place, dateFormat.format(new Date(file.createdAt))]
              .filter(Boolean)
              .join(" · ")
          }
        />
      ) : null}

      <StorageDialog
        open={confirming !== null}
        title={
          confirming?.length === 1
            ? "Delete this file?"
            : `Delete ${confirming?.length ?? 0} files?`
        }
        subtitle={`${formatStorageBytes(
          (confirming ?? []).reduce((sum, file) => sum + file.size, 0),
        )} will be freed at once.`}
        onClose={() => (remove.isPending ? undefined : setConfirming(null))}
        footer={
          <>
            <Button
              variant="quiet"
              elevation="flat"
              className="h-9 text-[0.82rem]!"
              disabled={remove.isPending}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              elevation="flat"
              className="h-9 text-[0.82rem]!"
              disabled={remove.isPending}
              onClick={() => confirming && runDelete(confirming)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="m-0 text-[0.84rem] leading-snug text-(--text-secondary)">
          Deleted files can’t be brought back. In chats the message stays and
          shows “This file was deleted” for everyone; copies forwarded to other
          chats stay there. Files in discussions and support are removed from
          the post or ticket.
        </p>
      </StorageDialog>
    </section>
  );
}
