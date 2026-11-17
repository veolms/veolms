import { useRef, useState, type DragEvent } from "react";
import { MARKETING_BLOCKS_MAX, type MarketingBlock } from "@veolms/contracts";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { MarketingBlockFields } from "./MarketingBlockFields";
import { BLOCK_ICONS, MarketingBlockPicker } from "./MarketingBlockPicker";
import {
  blockChoiceOf,
  blockLabel,
  newBlock,
  newBlockId,
  type MarketingBlockChoice,
} from "./marketingHelpers";

const iconButtonClass =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) disabled:pointer-events-none disabled:opacity-30";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** A block in a few words, for its folded row. */
function blockSummary(block: MarketingBlock): string {
  switch (block.type) {
    case "heading":
    case "text":
    case "quote":
      return block.text.replace(/\s+/gu, " ");
    case "button":
      return block.label;
    case "image":
      return block.alt || "Picture";
    case "coupon":
      return block.code;
    case "card":
      return block.title;
    case "divider":
      return "";
    case "spacer":
      return `${block.size[0]!.toUpperCase()}${block.size.slice(1)} space`;
  }
}

/**
 * The email's body as a list of blocks. Drag a block by its handle to move
 * it (or use the arrows: keyboard and touch), fold one to a line to see the
 * whole email at once, and add new ones at the end or between two.
 */
export function MarketingBlockEditor({
  blocks,
  onChange,
  disabled = false,
  aboutCourse = false,
  accentColor,
}: {
  blocks: readonly MarketingBlock[];
  onChange: (blocks: MarketingBlock[]) => void;
  /** The email's accent colour. */
  accentColor: string;
  disabled?: boolean;
  /** An automation email about a course: buttons may open that course. */
  aboutCourse?: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [handleId, setHandleId] = useState<string | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const draggedIndex = useRef<number | null>(null);
  const full = blocks.length >= MARKETING_BLOCKS_MAX;

  const update = (index: number, next: MarketingBlock) =>
    onChange(blocks.map((block, at) => (at === index ? next : block)));

  const insertAt = (index: number, choice: MarketingBlockChoice) => {
    const block = newBlock(choice);
    const next = [...blocks];
    next.splice(index, 0, block);
    setJustAdded(block.id);
    onChange(next);
    // Bring the new block into view and put the cursor in it.
    requestAnimationFrame(() => {
      const element = document.getElementById(`block-row-${block.id}`);
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      element
        ?.querySelector<HTMLElement>("input:not([type=file]), textarea")
        ?.focus({ preventScroll: true });
    });
  };

  const toggleFold = (id: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onDragStart = (event: DragEvent, index: number) => {
    draggedIndex.current = index;
    setDragging(blocks[index]!.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", blockLabel(blocks[index]!));
  };
  const onDragOver = (event: DragEvent, index: number) => {
    const from = draggedIndex.current;
    if (from === null) return;
    event.preventDefault();
    if (from === index) return;
    draggedIndex.current = index;
    onChange(move(blocks, from, index));
  };
  const onDragEnd = () => {
    draggedIndex.current = null;
    setDragging(null);
    setHandleId(null);
  };

  const allFolded =
    blocks.length > 0 && blocks.every((block) => folded.has(block.id));

  return (
    <div className="grid gap-3">
      {blocks.length > 2 ? (
        <div className="-mt-1 flex justify-end">
          <button
            type="button"
            onClick={() =>
              setFolded(
                allFolded
                  ? new Set()
                  : new Set(blocks.map((block) => block.id)),
              )
            }
            className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-semibold text-(--accent) hover:underline"
          >
            {allFolded ? "Open all blocks" : "Fold all blocks"}
          </button>
        </div>
      ) : null}
      <ul className="m-0 grid list-none gap-0 p-0" aria-label="Email blocks">
        {blocks.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] p-6 text-center text-[0.82rem] text-(--muted)">
            Your email is empty. Add a block below to start.
          </li>
        ) : null}
        {blocks.map((block, index) => {
          const BlockIcon = BLOCK_ICONS[blockChoiceOf(block)];
          const label = blockLabel(block);
          const isFolded = folded.has(block.id);
          const summary = blockSummary(block);
          return (
            <li key={block.id} className="grid">
              {index > 0 ? (
                <div className="group/insert relative flex h-5 items-center justify-center">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-6 top-1/2 h-px bg-(--accent)/40 opacity-0 transition-opacity group-focus-within/insert:opacity-100 group-hover/insert:opacity-100"
                  />
                  <span className="relative opacity-60 transition-opacity group-focus-within/insert:opacity-100 group-hover/insert:opacity-100 pointer-coarse:opacity-100">
                    <MarketingBlockPicker
                      variant="insert"
                      label={`Add a block above ${label} ${index + 1}`}
                      disabled={disabled || full}
                      onPick={(choice) => insertAt(index, choice)}
                    />
                  </span>
                </div>
              ) : null}
              <div
                id={`block-row-${block.id}`}
                draggable={!disabled && handleId === block.id}
                onDragStart={(event) => onDragStart(event, index)}
                onDragOver={(event) => onDragOver(event, index)}
                onDragEnd={onDragEnd}
                className={`group/block scroll-mt-24 rounded-xl border bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-colors ${
                  dragging === block.id
                    ? "border-(--accent)/60 opacity-60"
                    : justAdded === block.id
                      ? "border-(--accent)/50"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                }`}
              >
                <div
                  className={`flex items-center gap-1 px-1.5 py-1 ${
                    isFolded
                      ? ""
                      : "border-b border-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                  }`}
                >
                  <span
                    className={`flex shrink-0 items-center justify-center rounded-md p-1 text-(--muted) max-sm:hidden ${
                      disabled
                        ? "opacity-30"
                        : "cursor-grab hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:cursor-grabbing"
                    }`}
                    onMouseEnter={() => setHandleId(block.id)}
                    onMouseLeave={() => {
                      if (!dragging) setHandleId(null);
                    }}
                    title="Drag to move"
                    aria-hidden="true"
                  >
                    <DotsSixVertical size={18} />
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleFold(block.id)}
                    aria-expanded={!isFolded}
                    aria-label={`${isFolded ? "Open" : "Fold"} ${label} ${index + 1}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent px-1 py-1 text-left text-[13px] font-semibold text-(--text)"
                  >
                    <BlockIcon size={15} className="shrink-0 text-(--accent)" />
                    <span className="shrink-0">{label}</span>
                    {isFolded && summary ? (
                      <span className="min-w-0 truncate font-normal text-(--muted)">
                        {summary}
                      </span>
                    ) : null}
                    <CaretDown
                      size={13}
                      className={`ml-auto shrink-0 text-(--muted) transition-transform ${isFolded ? "-rotate-90" : ""}`}
                    />
                  </button>
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      className={iconButtonClass}
                      disabled={disabled || index === 0}
                      onClick={() => onChange(move(blocks, index, index - 1))}
                      aria-label={`Move ${label} up`}
                      title="Move up"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={iconButtonClass}
                      disabled={disabled || index === blocks.length - 1}
                      onClick={() => onChange(move(blocks, index, index + 1))}
                      aria-label={`Move ${label} down`}
                      title="Move down"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className={`${iconButtonClass} max-sm:hidden`}
                      disabled={disabled || full}
                      onClick={() => {
                        const next = [...blocks];
                        next.splice(index + 1, 0, {
                          ...block,
                          id: newBlockId(),
                        });
                        onChange(next);
                      }}
                      aria-label={`Duplicate ${label}`}
                      title="Duplicate"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      className={`${iconButtonClass} hover:bg-rose-500/10! hover:text-rose-500!`}
                      disabled={disabled}
                      onClick={() =>
                        onChange(blocks.filter((_, at) => at !== index))
                      }
                      aria-label={`Remove ${label}`}
                      title="Remove"
                    >
                      <Trash size={15} />
                    </button>
                  </span>
                </div>
                {isFolded ? null : (
                  <MarketingBlockFields
                    block={block}
                    disabled={disabled}
                    aboutCourse={aboutCourse}
                    accentColor={accentColor}
                    onChange={(next) => update(index, next)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <MarketingBlockPicker
        disabled={disabled || full}
        onPick={(choice) => insertAt(blocks.length, choice)}
      />
      {full ? (
        <p className="m-0 text-[12px] text-(--muted)">
          An email can have up to {MARKETING_BLOCKS_MAX} blocks.
        </p>
      ) : null}
    </div>
  );
}
