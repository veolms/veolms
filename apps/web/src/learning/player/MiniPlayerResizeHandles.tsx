import type { LearningMiniPlayerResizeEdges } from "./learningPlayerMotion";

const HANDLE_CLASS =
  "pointer-events-none absolute z-200 bg-transparent [@media(any-pointer:fine)]:pointer-events-auto";

const handles: ReadonlyArray<{
  className: string;
  edges: LearningMiniPlayerResizeEdges;
}> = [
  {
    className: "top-0 right-3 left-3 h-2 cursor-n-resize",
    edges: "n",
  },
  {
    className: "top-0 right-0 size-3 cursor-ne-resize",
    edges: "ne",
  },
  {
    className: "top-3 right-0 bottom-3 w-2 cursor-e-resize",
    edges: "e",
  },
  {
    className: "right-0 bottom-0 size-3 cursor-se-resize",
    edges: "se",
  },
  {
    className: "right-3 bottom-0 left-3 h-2 cursor-s-resize",
    edges: "s",
  },
  {
    className: "bottom-0 left-0 size-3 cursor-sw-resize",
    edges: "sw",
  },
  {
    className: "top-3 bottom-3 left-0 w-2 cursor-w-resize",
    edges: "w",
  },
  {
    className: "top-0 left-0 size-3 cursor-nw-resize",
    edges: "nw",
  },
];

export function MiniPlayerResizeHandles() {
  return handles.map(({ className, edges }) => (
    <span
      key={edges}
      aria-hidden="true"
      className={`${HANDLE_CLASS} ${className}`}
      data-mini-player-resize-handle={edges}
    />
  ));
}
