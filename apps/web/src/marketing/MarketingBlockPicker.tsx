import { useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { ArrowsVerticalIcon as ArrowsVertical } from "@phosphor-icons/react/ArrowsVertical";
import { CalendarStarIcon as CalendarStar } from "@phosphor-icons/react/CalendarStar";
import { CardsIcon as Cards } from "@phosphor-icons/react/Cards";
import { CursorClickIcon as CursorClick } from "@phosphor-icons/react/CursorClick";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { ImageIcon as ImageSquare } from "@phosphor-icons/react/Image";
import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { QuotesIcon as Quotes } from "@phosphor-icons/react/Quotes";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react/TextAlignLeft";
import { TextHIcon as TextH } from "@phosphor-icons/react/TextH";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { BLOCK_GROUPS, type MarketingBlockChoice } from "./marketingHelpers";

export const BLOCK_ICONS: Record<MarketingBlockChoice, Icon> = {
  heading: TextH,
  text: TextAlignLeft,
  button: CursorClick,
  image: ImageSquare,
  divider: Minus,
  spacer: ArrowsVertical,
  coupon: Tag,
  card: Cards,
  course: GraduationCap,
  workshop: CalendarStar,
  quote: Quotes,
};

/**
 * "Add a block": every kind of block in three groups, each with a line on
 * what it is for. `variant="insert"` is the small + between two blocks.
 */
export function MarketingBlockPicker({
  onPick,
  disabled = false,
  variant = "add",
  label = "Add a block",
}: {
  onPick: (choice: MarketingBlockChoice) => void;
  disabled?: boolean;
  variant?: "add" | "insert";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        title={label}
        className={
          variant === "insert"
            ? "inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-(--surface) text-(--muted) shadow-sm transition-colors hover:border-(--accent) hover:text-(--accent) disabled:pointer-events-none disabled:opacity-40 data-popup-open:border-(--accent) data-popup-open:text-(--accent)"
            : "inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-transparent text-[13px] font-semibold text-(--text) transition-colors hover:border-(--accent)/60 hover:bg-(--accent)/6 disabled:pointer-events-none disabled:opacity-40 data-popup-open:border-(--accent)/60"
        }
      >
        <Plus size={variant === "insert" ? 12 : 16} weight="bold" />
        {variant === "add" ? label : null}
      </PopoverTrigger>
      {open ? (
        <PopoverContent
          align="center"
          side="bottom"
          className="w-[min(30rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-y-auto p-2.5"
        >
          <div className="grid gap-3">
            {BLOCK_GROUPS.map((group) => (
              <div key={group.title} className="grid gap-1.5">
                <p className="m-0 px-1 text-[11px] font-semibold tracking-wide text-(--muted) uppercase">
                  {group.title}
                </p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {group.choices.map((choice) => {
                    const ChoiceIcon = BLOCK_ICONS[choice.type];
                    return (
                      <button
                        key={choice.type}
                        type="button"
                        onClick={() => {
                          onPick(choice.type);
                          setOpen(false);
                        }}
                        className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border-none bg-transparent p-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                      >
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                          <ChoiceIcon size={15} />
                        </span>
                        <span className="grid min-w-0">
                          <span className="text-[12.5px] font-semibold text-(--text)">
                            {choice.label}
                          </span>
                          <span className="text-[11px] leading-4 text-(--muted)">
                            {choice.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
