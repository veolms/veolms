import type { LearningMiniPlayerResizeEdges } from "./learningPlayerMotion";

const HANDLE_CLASS =
  "pointer-events-none absolute z-200 bg-transparent [@media(any-pointer:fine)]:pointer-events-auto";

const handles: ReadonlyArray<{
  className: string;
  collapsedCursor: string;
  edges: LearningMiniPlayerResizeEdges;
  expandedCursor?: string;
}> = [
  {
    className: "top-0 right-3 left-3 h-2",
    collapsedCursor: "cursor-n-resize",
    edges: "n",
    expandedCursor: "cursor-ns-resize",
  },
  {
    className: "top-0 right-0 size-3",
    collapsedCursor: "cursor-ne-resize",
    edges: "ne",
    expandedCursor: "cursor-ns-resize",
  },
  {
    className: "top-3 right-0 bottom-3 w-2",
    collapsedCursor: "cursor-e-resize",
    edges: "e",
  },
  {
    className: "right-0 bottom-0 size-3",
    collapsedCursor: "cursor-se-resize",
    edges: "se",
    expandedCursor: "cursor-ns-resize",
  },
  {
    className: "right-3 bottom-0 left-3 h-2",
    collapsedCursor: "cursor-s-resize",
    edges: "s",
    expandedCursor: "cursor-ns-resize",
  },
  {
    className: "bottom-0 left-0 size-3",
    collapsedCursor: "cursor-sw-resize",
    edges: "sw",
    expandedCursor: "cursor-ns-resize",
  },
  {
    className: "top-3 bottom-3 left-0 w-2",
    collapsedCursor: "cursor-w-resize",
    edges: "w",
  },
  {
    className: "top-0 left-0 size-3",
    collapsedCursor: "cursor-nw-resize",
    edges: "nw",
    expandedCursor: "cursor-ns-resize",
  },
];

export function MiniPlayerResizeHandles({
  expanded = false,
}: {
  expanded?: boolean;
}) {
  return handles.map(
    ({ className, collapsedCursor, edges, expandedCursor }) => (
      <span
        key={edges}
        aria-hidden="true"
        className={`${HANDLE_CLASS} ${className} ${expanded && expandedCursor ? expandedCursor : collapsedCursor}`}
        data-mini-player-resize-handle={edges}
      />
    ),
  );
}
