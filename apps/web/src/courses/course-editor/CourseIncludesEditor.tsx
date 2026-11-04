import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import {
  COURSE_INCLUDE_DETAIL_MAX,
  COURSE_INCLUDE_ICONS,
  COURSE_INCLUDE_PALETTE,
  COURSE_INCLUDE_TEXT_MAX,
  DEFAULT_COURSE_INCLUDES,
  MAX_COURSE_INCLUDES,
  SUGGESTED_COURSE_INCLUDES,
  type CourseIncludeIcon,
  type CourseIncludePreset,
} from "@veolms/contracts";
import {
  COURSE_INCLUDE_ICON_GLYPHS,
  FALLBACK_INCLUDE_COLOR,
  courseIncludeGlyph,
  courseIncludeIconWeight,
  pickIncludeColor,
} from "../includes/courseIncludeIcons";
import type { IncludeDraftItem } from "./editorLocalTypes";

export interface CourseIncludesEditorProps {
  items: IncludeDraftItem[];
  /** The words of the video line, as learners will see them. */
  videoWords: { title: string; detail: string };
  /** Reordering, saving or deleting: the list is held still meanwhile. */
  busy: boolean;
  isSaving: (id: string) => boolean;
  isDeleting: (id: string) => boolean;
  statusOf: (id: string) => "saving" | "saved" | "failed" | null;
  dragEnabledId: string | null;
  setDragEnabledId: (id: string | null) => void;
  onAdd: (preset?: Partial<Omit<CourseIncludePreset, "color">>) => void;
  onTextChange: (id: string, text: string) => void;
  onDetailChange: (id: string, detail: string) => void;
  /** A title or detail field lost focus: what changed is saved. */
  onCommit: (id: string) => void;
  onStyle: (
    id: string,
    style: { icon?: CourseIncludeIcon; color?: string },
  ) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: DragEvent, index: number, text: string) => void;
  onDragOver: (event: DragEvent, index: number) => void;
  onDragEnd: () => void;
}

/** The icon in its tinted square, as the learner card draws it. */
function IncludeIconTile({
  icon,
  color,
  size = "md",
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "md" | "sm";
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--perk-tone)_15%,transparent)] text-(--perk-tone) ${
        size === "md" ? "size-11" : "size-8 rounded-lg"
      }`}
      style={
        { "--perk-tone": color || FALLBACK_INCLUDE_COLOR } as CSSProperties
      }
    >
      {createElement(courseIncludeGlyph(icon), {
        size: size === "md" ? 24 : 18,
        weight: courseIncludeIconWeight(icon),
        "aria-hidden": true,
      })}
    </span>
  );
}

/**
 * The course's "This course includes" card, edited where it is shown: each
 * line drawn as learners see it (icon in its tinted square, title, a
 * quieter line), and opened for editing with a click: its words, its icon
 * and its colour. Lines can be reordered by their handle, removed, and
 * added from ready-made suggestions or written from scratch. The square
 * behind an icon is always a tint of the icon's own colour.
 */
export function CourseIncludesEditor({
  items,
  videoWords,
  busy,
  isSaving,
  isDeleting,
  statusOf,
  dragEnabledId,
  setDragEnabledId,
  onAdd,
  onTextChange,
  onDetailChange,
  onCommit,
  onStyle,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
}: CourseIncludesEditorProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const full = items.length >= MAX_COURSE_INCLUDES;
  // The colour the next line gets (one no line uses), shown on the chips.
  const nextColor = pickIncludeColor(items.map((item) => item.color));

  // Ready-made lines not on the card yet: the standard ones first, then
  // the extras.
  const titles = new Set(items.map((item) => item.text.trim().toLowerCase()));
  const hasVideo = items.some((item) => item.kind === "video");
  const suggestions = [...DEFAULT_COURSE_INCLUDES, ...SUGGESTED_COURSE_INCLUDES]
    .filter((preset) =>
      preset.kind === "video"
        ? !hasVideo
        : !titles.has(preset.text.toLowerCase()),
    )
    .map((preset) =>
      preset.kind === "video"
        ? { ...preset, text: "On-demand video (from your curriculum)" }
        : preset,
    );

  return (
    <div className="flex flex-col gap-5">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] p-5 text-center text-[0.82rem] text-(--muted)">
            Nothing listed yet. Add a line below; learners see this list on the
            course page.
          </li>
        ) : null}
        {items.map((item, index) => {
          const open = openId === item.id;
          const pending =
            item.isPendingCreation || isSaving(item.id) || isDeleting(item.id);
          const isVideo = item.kind === "video";
          const title = isVideo ? videoWords.title : item.text;
          const detail = isVideo ? videoWords.detail : item.detail;
          const status = statusOf(item.id);
          return (
            <li
              key={item.id}
              draggable={!busy && !pending && dragEnabledId === item.id}
              onDragStart={(event) => onDragStart(event, index, title)}
              onDragOver={(event) => onDragOver(event, index)}
              onDragEnd={onDragEnd}
              className={`group/line rounded-xl border transition-colors ${
                open
                  ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))]"
                  : "border-transparent hover:border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))]"
              } ${pending ? "opacity-70" : ""}`}
            >
              <div className="flex items-center gap-1.5 p-1.5 pr-2">
                <span
                  className={`flex shrink-0 items-center justify-center rounded-md p-1 text-(--muted) ${
                    busy || pending
                      ? "pointer-events-none opacity-30"
                      : "cursor-grab opacity-0 group-hover/line:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:cursor-grabbing max-[768px]:opacity-100"
                  }`}
                  onMouseEnter={() => setDragEnabledId(item.id)}
                  onMouseLeave={() => setDragEnabledId(null)}
                  title="Drag to reorder"
                >
                  <DotsSixVertical size={18} />
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-3.5 rounded-lg border-none bg-transparent p-1 text-left"
                >
                  <IncludeIconTile icon={item.icon} color={item.color} />
                  <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                    <span className="text-[0.95rem] leading-snug font-semibold text-(--text)">
                      {title || "Untitled line"}
                    </span>
                    {detail ? (
                      <span className="text-[0.84rem] leading-snug text-(--muted)">
                        {detail}
                      </span>
                    ) : null}
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-1">
                  {item.isPendingCreation ? (
                    <CircleNotch
                      size={16}
                      className="animate-spin text-(--accent)"
                    />
                  ) : status === "saved" ? (
                    <Check
                      size={15}
                      weight="bold"
                      className="text-green-500"
                      aria-label="Saved"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) opacity-0 transition-colors group-hover/line:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) focus-visible:opacity-100 max-[768px]:opacity-100"
                    aria-label={`Edit ${title}`}
                    title="Edit"
                  >
                    <PencilSimple size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={busy || pending}
                    onClick={() => {
                      if (open) setOpenId(null);
                      onDelete(item.id);
                    }}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) opacity-0 transition-colors group-hover/line:opacity-100 hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-30 max-[768px]:opacity-100"
                    aria-label={`Remove ${title}`}
                    title="Remove"
                  >
                    {isDeleting(item.id) ? (
                      <CircleNotch size={15} className="animate-spin" />
                    ) : (
                      <Trash size={16} />
                    )}
                  </button>
                </span>
              </div>

              {open ? (
                <IncludeLineEditor
                  item={item}
                  isVideo={isVideo}
                  disabled={busy || Boolean(item.isPendingCreation)}
                  onTextChange={(text) => onTextChange(item.id, text)}
                  onDetailChange={(text) => onDetailChange(item.id, text)}
                  onCommit={() => onCommit(item.id)}
                  onStyle={(style) => onStyle(item.id, style)}
                  onDone={() => setOpenId(null)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.74rem] font-bold tracking-wider text-(--muted) uppercase">
            Add a line
          </span>
          <span
            className={`text-[0.74rem] font-semibold ${full ? "text-amber-500" : "text-(--muted)"}`}
          >
            {items.length} / {MAX_COURSE_INCLUDES}
          </span>
        </div>
        {suggestions.length > 0 && !full ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((preset) => (
              <button
                key={preset.text}
                type="button"
                disabled={busy}
                onClick={() => onAdd(preset)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] py-1.5 pr-3 pl-1.5 text-[0.8rem] font-semibold text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--text) disabled:pointer-events-none disabled:opacity-40"
              >
                <IncludeIconTile
                  icon={preset.icon}
                  color={nextColor}
                  size="sm"
                />
                {preset.text}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy || full}
          onClick={() => onAdd()}
          className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] text-[0.84rem] font-bold text-(--accent) transition-colors hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} weight="bold" />
          {full
            ? `At most ${MAX_COURSE_INCLUDES} lines`
            : "Write your own line"}
        </button>
      </div>
    </div>
  );
}

/** The open line: its words, then its icon and its colour. */
function IncludeLineEditor({
  item,
  isVideo,
  disabled,
  onTextChange,
  onDetailChange,
  onCommit,
  onStyle,
  onDone,
}: {
  item: IncludeDraftItem;
  isVideo: boolean;
  disabled: boolean;
  onTextChange: (text: string) => void;
  onDetailChange: (text: string) => void;
  onCommit: () => void;
  onStyle: (style: { icon?: CourseIncludeIcon; color?: string }) => void;
  onDone: () => void;
}) {
  const color = item.color || FALLBACK_INCLUDE_COLOR;
  // The free colour picker reports every step of a drag; only where it
  // comes to rest is saved.
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (colorTimer.current) clearTimeout(colorTimer.current);
    },
    [],
  );
  const pickFreeColor = (value: string) => {
    if (colorTimer.current) clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(() => onStyle({ color: value }), 350);
  };
  const fieldClasses =
    "w-full min-w-0 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 py-2 text-[0.88rem] text-(--text) outline-none transition-[border-color] focus:border-(--accent) disabled:opacity-60";
  const labelClasses =
    "text-[0.74rem] font-bold tracking-wider text-(--muted) uppercase";
  return (
    <div className="flex flex-col gap-4 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3.5 pt-3.5 pb-4">
      {isVideo ? (
        <p className="m-0 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 py-2 text-[0.8rem] text-(--muted)">
          This line is written from your curriculum (video length, sections and
          lessons), so it stays right as the course grows. Its icon and colour
          are yours.
        </p>
      ) : (
        <div className="grid gap-3 min-[900px]:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClasses}>Title</span>
            <input
              type="text"
              value={item.text}
              disabled={disabled}
              maxLength={COURSE_INCLUDE_TEXT_MAX}
              onChange={(event) => onTextChange(event.target.value)}
              onBlur={onCommit}
              placeholder="e.g. Source code"
              className={fieldClasses}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClasses}>Line under it</span>
            <input
              type="text"
              value={item.detail ?? ""}
              disabled={disabled}
              maxLength={COURSE_INCLUDE_DETAIL_MAX}
              onChange={(event) => onDetailChange(event.target.value)}
              onBlur={onCommit}
              placeholder="Optional, e.g. Every project's code"
              className={fieldClasses}
            />
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className={labelClasses}>Icon</span>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
          {COURSE_INCLUDE_ICONS.map((key) => {
            const Glyph = COURSE_INCLUDE_ICON_GLYPHS[key];
            const selected = item.icon === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onStyle({ icon: key })}
                aria-label={key.replace(/-/gu, " ")}
                aria-pressed={selected}
                title={key.replace(/-/gu, " ")}
                className={`grid aspect-square cursor-pointer place-items-center rounded-lg border transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-(--perk-tone) bg-[color-mix(in_srgb,var(--perk-tone)_15%,transparent)] text-(--perk-tone)"
                    : "border-transparent bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-(--text-secondary) hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-(--text)"
                }`}
                style={{ "--perk-tone": color } as CSSProperties}
              >
                <Glyph size={20} weight={courseIncludeIconWeight(key)} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClasses}>Colour</span>
        <div className="flex flex-wrap items-center gap-2">
          {COURSE_INCLUDE_PALETTE.map((swatch) => {
            const selected = color.toLowerCase() === swatch;
            return (
              <button
                key={swatch}
                type="button"
                disabled={disabled}
                onClick={() => onStyle({ color: swatch })}
                aria-label={`Colour ${swatch}`}
                aria-pressed={selected}
                className={`size-7 cursor-pointer rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 ${
                  selected ? "border-(--text)" : "border-transparent"
                }`}
                style={{ backgroundColor: swatch }}
              />
            );
          })}
          <label
            className="relative inline-flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-(--muted) hover:text-(--text)"
            title="Pick any colour"
          >
            <Plus size={13} weight="bold" />
            <input
              type="color"
              value={color}
              disabled={disabled}
              onChange={(event) => pickFreeColor(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Pick any colour"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-none bg-(--accent) px-3.5 text-[0.8rem] font-bold text-(--on-accent)"
        >
          <Check size={14} weight="bold" />
          Done
        </button>
      </div>
    </div>
  );
}
