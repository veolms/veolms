import { guestHomeBlockStart, guestHomeGutter } from "./guestHomeSpacing";
import type { HomePageHighlight } from "@veolms/contracts/home-page-defaults";
import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { CodeIcon as Code } from "@phosphor-icons/react/Code";
import { StackIcon as Stack } from "@phosphor-icons/react/Stack";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";

// A highlight's icon and colour come from its position; its words are the
// academy's own (see the home page settings).
const highlightStyles = [
  { icon: BookOpenText, tone: "bg-sky-500/15 text-sky-500" },
  { icon: Code, tone: "bg-violet-500/15 text-violet-500" },
  { icon: Stack, tone: "bg-emerald-500/15 text-emerald-500" },
  { icon: Target, tone: "bg-amber-500/15 text-amber-500" },
] as const;

/** What the courses promise: four small cards under the hero. */
export function GuestHomeHighlights({
  items,
}: {
  items: readonly HomePageHighlight[];
}) {
  return (
    <ul
      aria-label="What you get"
      className={`grid grid-cols-2 gap-3 @3xl/home:grid-cols-4 @3xl/home:gap-4 ${guestHomeGutter} ${guestHomeBlockStart}`}
    >
      {items
        .slice(0, highlightStyles.length)
        .map(({ title, description }, index) => {
          const { icon: Icon, tone } = highlightStyles[index]!;
          return (
            <li
              key={index}
              className="flex min-w-0 items-center gap-3 rounded-xl bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) p-3 shadow-(--raised-surface-shadow) @3xl/home:gap-3.5 @3xl/home:px-4 @3xl/home:py-3.5"
            >
              <span
                aria-hidden="true"
                className={`grid size-10 shrink-0 place-items-center rounded-lg @3xl/home:size-11 ${tone}`}
              >
                <Icon size={24} weight="fill" />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm leading-snug font-semibold text-(--text) @5xl/home:text-[0.9375rem]">
                  {title}
                </strong>
                {description ? (
                  <span className="mt-0.5 block text-xs leading-snug text-(--muted) @5xl/home:text-[0.8125rem]">
                    {description}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
    </ul>
  );
}
