import { cn } from "../lib/utils";

const bar =
  "animate-pulse rounded bg-[color-mix(in_srgb,var(--text)_9%,transparent)]";

/** The chat list while it loads: rows in the list's own shape. */
export function ChatListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex h-18 items-center gap-3 px-4">
          <span className={cn(bar, "size-12 shrink-0 rounded-full")} />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={cn(bar, "h-3.5 w-2/5")} />
            <span className={cn(bar, "h-3 w-4/5")} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A chat's messages while they load: alternating bubbles. */
export function ChatThreadSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="relative flex flex-1 flex-col justify-end gap-2 px-[4%] py-4"
    >
      {[44, 30, 56, 38, 50, 26].map((width, index) => (
        <span
          key={index}
          className={cn(
            bar,
            "h-10 rounded-lg",
            index % 3 === 1 ? "self-end" : "self-start",
          )}
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}
