import { useLayoutEffect, useRef, useState } from "react";

/**
 * Shown while the sidebar is being resized and the "show sizes while
 * resizing" setting is on: the sidebar's current width and the width of the
 * main content panel beside it, which grows as the sidebar shrinks.
 *
 * It is the last child of the sidebar's menu list, a fixed distance below
 * the last menu item. Sideways it keeps to a box as wide as a collapsed menu
 * item at the list's left edge, which is where it sits on the collapsed
 * rail. Neither depends on the sidebar's width, so it stays put however far
 * the sidebar is dragged.
 */
export function SidebarResizeReadout({
  sidebarWidth,
}: {
  sidebarWidth: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [appWidth, setAppWidth] = useState<number | null>(null);

  // The main panel's width follows the sidebar through layout, so it is
  // measured from the panel itself rather than derived from the sidebar.
  // It is read straight after each sidebar width is applied, and observed as
  // well in case the panel settles a moment later.
  useLayoutEffect(() => {
    const main = rootRef.current
      ?.closest(".courses-app")
      ?.querySelector(".courses-main-frame");
    if (!main) return;

    const measure = () => setAppWidth(main.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    return () => observer.disconnect();
  }, [sidebarWidth]);

  return (
    <div ref={rootRef} className="pointer-events-none mt-6 w-[57px] shrink-0">
      <dl
        className="m-0 grid justify-items-center gap-2 text-center tabular-nums"
        aria-live="off"
        data-sidebar-resize-readout=""
      >
        <ReadoutValue label="Sidebar" pixels={sidebarWidth} />
        {appWidth !== null ? (
          <ReadoutValue label="App" pixels={appWidth} />
        ) : null}
      </dl>
    </div>
  );
}

function ReadoutValue({ label, pixels }: { label: string; pixels: number }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[10px] font-semibold tracking-wide text-(--muted) uppercase">
        {label}
      </dt>
      <dd className="m-0 text-xs font-semibold text-(--text)">
        {Math.round(pixels)}px
      </dd>
    </div>
  );
}
