import { useState } from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { TextAaIcon as TextAa } from "@phosphor-icons/react/TextAa";
import { AppSlider } from "../AppSlider";
import {
  DISCUSSION_TEXT_SCALE_MAX,
  DISCUSSION_TEXT_SCALE_MIN,
  DISCUSSION_TEXT_SCALE_STEP,
  useDiscussionTextScale,
} from "./discussionTextScale";

/**
 * The text size of the discussion in the panel, as an item of the panel's
 * "⋮" menu: "Text size" and the size now, which opens (in the menu, which
 * stays open) into a slider between a small and a large "A". Most people
 * never change it, so the slider is folded away until asked for.
 */
export function DiscussionTextSizeMenuItem() {
  const [scale, setScale] = useDiscussionTextScale();
  const [open, setOpen] = useState(false);
  const percent = Math.round(scale * 100);

  return (
    <div>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-expanded={open}
        onClick={(event) => {
          // Not a command: the menu stays open around the slider.
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[0.78rem] transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${
          open ? "text-(--text)" : "text-(--text-secondary)"
        }`}
      >
        <TextAa size={17} aria-hidden="true" />
        <span className="flex-1">Text size</span>
        <span className="text-xs text-(--muted) tabular-nums">{percent}%</span>
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className={`text-(--muted) transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div
          className="flex items-center gap-2.5 px-3 pt-1 pb-2"
          // The menu moves between its items with the arrow keys; the
          // slider keeps Left and Right for itself.
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.stopPropagation();
            }
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setScale(DISCUSSION_TEXT_SCALE_MIN);
            }}
            aria-label="Smallest text"
            className="w-4 shrink-0 text-center text-[0.6875rem] font-bold text-(--muted) hover:text-(--text)"
          >
            A
          </button>
          <AppSlider
            min={DISCUSSION_TEXT_SCALE_MIN}
            max={DISCUSSION_TEXT_SCALE_MAX}
            step={DISCUSSION_TEXT_SCALE_STEP}
            value={scale}
            aria-label="Text size"
            aria-valuetext={`${percent} percent`}
            className="min-w-0 flex-1"
            onChange={(event) => setScale(event.currentTarget.valueAsNumber)}
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setScale(DISCUSSION_TEXT_SCALE_MAX);
            }}
            aria-label="Largest text"
            className="w-4 shrink-0 text-center text-base font-bold text-(--muted) hover:text-(--text)"
          >
            A
          </button>
        </div>
      )}
      {open && percent !== 100 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setScale(1);
          }}
          className="mx-3 mb-1.5 rounded px-1 text-xs font-semibold text-(--accent) hover:underline"
        >
          Reset to 100%
        </button>
      )}
    </div>
  );
}
