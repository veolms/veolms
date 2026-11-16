import { useRef, useState, type DragEvent } from "react";
import {
  MARKETING_BLOCKS_MAX,
  MARKETING_BUTTON_LABEL_MAX,
  MARKETING_COURSE_LINK,
  MARKETING_HEADING_MAX,
  MARKETING_TEXT_MAX,
  type MarketingBlock,
  type MarketingBlockType,
} from "@veolms/contracts";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { CursorClickIcon as CursorClick } from "@phosphor-icons/react/CursorClick";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { ImageIcon as ImageSquare } from "@phosphor-icons/react/Image";
import { ArrowsVerticalIcon as ArrowsVertical } from "@phosphor-icons/react/ArrowsVertical";
import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react/TextAlignLeft";
import { TextHIcon as TextH } from "@phosphor-icons/react/TextH";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { Icon } from "@phosphor-icons/react";
import { ThemedSelect } from "../ThemedSelect";
import {
  fieldClass,
  inputClass,
  selectTriggerClass,
} from "../workshops/workshopHelpers";
import {
  BLOCK_CHOICES,
  blockLabel,
  isWebAddress,
  newBlock,
  newBlockId,
} from "./marketingHelpers";

const BLOCK_ICONS: Record<MarketingBlockType, Icon> = {
  heading: TextH,
  text: TextAlignLeft,
  button: CursorClick,
  image: ImageSquare,
  divider: Minus,
  spacer: ArrowsVertical,
};

const iconButtonClass =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) disabled:pointer-events-none disabled:opacity-30";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * The email's body as a list of blocks. Drag a block by its handle to move
 * it (or use the arrows: keyboard and touch); each block edits in place.
 */
export function MarketingBlockEditor({
  blocks,
  onChange,
  disabled = false,
  aboutCourse = false,
}: {
  blocks: readonly MarketingBlock[];
  onChange: (blocks: MarketingBlock[]) => void;
  disabled?: boolean;
  /** An automation email about a course: buttons may open that course. */
  aboutCourse?: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [handleId, setHandleId] = useState<string | null>(null);
  const draggedIndex = useRef<number | null>(null);
  const full = blocks.length >= MARKETING_BLOCKS_MAX;

  const update = (index: number, next: MarketingBlock) =>
    onChange(blocks.map((block, at) => (at === index ? next : block)));

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

  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2.5 p-0" aria-label="Email blocks">
        {blocks.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] p-6 text-center text-[0.82rem] text-(--muted)">
            Your email is empty. Add a block below to start.
          </li>
        ) : null}
        {blocks.map((block, index) => {
          const BlockIcon = BLOCK_ICONS[block.type];
          const label = blockLabel(block);
          return (
            <li
              key={block.id}
              draggable={!disabled && handleId === block.id}
              onDragStart={(event) => onDragStart(event, index)}
              onDragOver={(event) => onDragOver(event, index)}
              onDragEnd={onDragEnd}
              className={`group/block rounded-xl border bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-colors ${
                dragging === block.id
                  ? "border-(--accent)/60 opacity-60"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
              }`}
            >
              <div className="flex items-center gap-1 border-b border-[color-mix(in_srgb,var(--text)_7%,transparent)] px-1.5 py-1">
                <span
                  className={`flex shrink-0 items-center justify-center rounded-md p-1 text-(--muted) ${
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
                <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold text-(--text)">
                  <BlockIcon size={15} className="shrink-0 text-(--accent)" />
                  {label}
                </span>
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
                    className={iconButtonClass}
                    disabled={disabled || full}
                    onClick={() => {
                      const next = [...blocks];
                      next.splice(index + 1, 0, { ...block, id: newBlockId() });
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
              <BlockFields
                block={block}
                disabled={disabled}
                aboutCourse={aboutCourse}
                onChange={(next) => update(index, next)}
              />
            </li>
          );
        })}
      </ul>

      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Add a block"
      >
        <span className="mr-1 text-[12px] font-medium text-(--muted)">Add</span>
        {BLOCK_CHOICES.map((choice) => {
          const ChoiceIcon = BLOCK_ICONS[choice.type];
          return (
            <button
              key={choice.type}
              type="button"
              disabled={disabled || full}
              onClick={() => onChange([...blocks, newBlock(choice.type)])}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) px-2.5 text-[12px] font-semibold text-(--text-secondary,var(--text)) transition-colors hover:border-(--accent)/40 hover:text-(--text) disabled:pointer-events-none disabled:opacity-40"
            >
              <ChoiceIcon size={14} className="text-(--accent)" />
              {choice.label}
            </button>
          );
        })}
      </div>
      {full ? (
        <p className="m-0 text-[12px] text-(--muted)">
          An email can have up to {MARKETING_BLOCKS_MAX} blocks.
        </p>
      ) : null}
    </div>
  );
}

function SmallLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[12px] font-medium text-(--muted)"
    >
      {children}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 mb-0 text-[12px] text-rose-500">{children}</p>;
}

function LinkField({
  id,
  value,
  onChange,
  disabled,
  aboutCourse,
  label,
  optional = false,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  aboutCourse: boolean;
  label: string;
  optional?: boolean;
}) {
  const toCourse = value === MARKETING_COURSE_LINK;
  const text = value ?? "";
  const invalid = !toCourse && text.length > 0 && !isWebAddress(text);
  return (
    <div className="min-w-0">
      <SmallLabel htmlFor={id}>{label}</SmallLabel>
      {aboutCourse ? (
        <div className={`${fieldClass} mb-2 flex w-full items-center`}>
          <ThemedSelect
            id={`${id}-kind`}
            value={toCourse ? "course" : "address"}
            onValueChange={(choice) =>
              onChange(
                choice === "course"
                  ? MARKETING_COURSE_LINK
                  : optional
                    ? null
                    : "https://",
              )
            }
            options={[
              ["course", "Their course"],
              ["address", "A web address"],
            ]}
            disabled={disabled}
            ariaLabel={`${label}: where it goes`}
            triggerClassName={selectTriggerClass}
          />
        </div>
      ) : null}
      {toCourse ? (
        <p className="m-0 text-[12px] text-(--muted)">
          Opens the course this email is about.
        </p>
      ) : (
        <>
          <input
            id={id}
            type="url"
            inputMode="url"
            value={text}
            onChange={(event) => {
              const next = event.target.value.trim();
              onChange(optional && !next ? null : event.target.value);
            }}
            placeholder={optional ? "Optional: https://..." : "https://..."}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={`${inputClass} w-full`}
          />
          {invalid ? (
            <FieldError>
              Use a full web address starting with https://
            </FieldError>
          ) : null}
        </>
      )}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
  disabled,
  aboutCourse,
}: {
  block: MarketingBlock;
  onChange: (block: MarketingBlock) => void;
  disabled: boolean;
  aboutCourse: boolean;
}) {
  const id = `block-${block.id}`;
  switch (block.type) {
    case "heading":
      return (
        <div className="p-3">
          <input
            id={id}
            type="text"
            value={block.text}
            maxLength={MARKETING_HEADING_MAX}
            onChange={(event) =>
              onChange({ ...block, text: event.target.value })
            }
            placeholder="A clear headline"
            disabled={disabled}
            aria-label="Heading"
            className={`${inputClass} w-full font-semibold`}
          />
        </div>
      );
    case "text":
      return (
        <div className="p-3">
          <textarea
            id={id}
            value={block.text}
            maxLength={MARKETING_TEXT_MAX}
            onChange={(event) =>
              onChange({ ...block, text: event.target.value })
            }
            placeholder="Write your message. Leave a blank line for a new paragraph."
            disabled={disabled}
            rows={Math.min(12, Math.max(3, block.text.split("\n").length + 1))}
            aria-label="Text"
            className={`${inputClass} h-auto! w-full resize-y py-2.5 leading-6`}
          />
          <p className="mt-1 mb-0 text-[11.5px] text-(--muted)">
            Blank line = new paragraph ·{" "}
            <span className="font-semibold">**bold**</span> · {"{first_name}"}{" "}
            for their name
          </p>
        </div>
      );
    case "button":
      return (
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <div className="min-w-0">
            <SmallLabel htmlFor={`${id}-label`}>Button text</SmallLabel>
            <input
              id={`${id}-label`}
              type="text"
              value={block.label}
              maxLength={MARKETING_BUTTON_LABEL_MAX}
              onChange={(event) =>
                onChange({ ...block, label: event.target.value })
              }
              placeholder="Start learning"
              disabled={disabled}
              className={`${inputClass} w-full`}
            />
          </div>
          <LinkField
            id={`${id}-url`}
            label="Opens"
            value={block.url}
            onChange={(url) => onChange({ ...block, url: url ?? "" })}
            disabled={disabled}
            aboutCourse={aboutCourse}
          />
        </div>
      );
    case "image": {
      const imageInvalid =
        block.url.length > 8 &&
        !(block.url.startsWith("https://") && isWebAddress(block.url));
      return (
        <div className="grid gap-3 p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <div className="min-w-0">
              <SmallLabel htmlFor={`${id}-src`}>Image address</SmallLabel>
              <input
                id={`${id}-src`}
                type="url"
                inputMode="url"
                value={block.url}
                onChange={(event) =>
                  onChange({ ...block, url: event.target.value })
                }
                placeholder="https://.../banner.png"
                disabled={disabled}
                aria-invalid={imageInvalid || undefined}
                className={`${inputClass} w-full`}
              />
              {imageInvalid ? (
                <FieldError>
                  Use an image address starting with https://
                </FieldError>
              ) : (
                <p className="mt-1 mb-0 text-[11.5px] text-(--muted)">
                  A public image link, 1200 px wide works best.
                </p>
              )}
            </div>
            <div
              className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--canvas) text-(--muted)"
              aria-hidden="true"
            >
              {isWebAddress(block.url) && block.url.startsWith("https://") ? (
                <img
                  src={block.url}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <ImageSquare size={22} />
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <SmallLabel htmlFor={`${id}-alt`}>Describe the image</SmallLabel>
              <input
                id={`${id}-alt`}
                type="text"
                value={block.alt}
                maxLength={200}
                onChange={(event) =>
                  onChange({ ...block, alt: event.target.value })
                }
                placeholder="Shown if the image doesn't load"
                disabled={disabled}
                className={`${inputClass} w-full`}
              />
            </div>
            <LinkField
              id={`${id}-link`}
              label="Opens when tapped"
              value={block.link}
              onChange={(link) => onChange({ ...block, link })}
              disabled={disabled}
              aboutCourse={aboutCourse}
              optional
            />
          </div>
        </div>
      );
    }
    case "divider":
      return (
        <div className="px-4 py-3.5" aria-hidden="true">
          <div className="h-px bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
        </div>
      );
    case "spacer":
      return (
        <div className="flex items-center gap-3 p-3">
          <span className="text-[12px] font-medium text-(--muted)">Height</span>
          <div className={`${fieldClass} flex w-40 items-center`}>
            <ThemedSelect
              id={id}
              value={block.size}
              onValueChange={(size) => onChange({ ...block, size })}
              options={[
                ["small", "Small"],
                ["medium", "Medium"],
                ["large", "Large"],
              ]}
              disabled={disabled}
              ariaLabel="Space height"
              triggerClassName={selectTriggerClass}
            />
          </div>
        </div>
      );
  }
}
