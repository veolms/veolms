import "./shell-drag-surface.css";

/**
 * Boxes that take over painting the shell's backdrop and the main frame's
 * surface while the sidebar is dragged on a touch-first device, so that the
 * drag does not make the browser re-raster them on every frame. They are
 * hidden at all other times; shell-drag-surface.css has the when, the how
 * and the why.
 *
 * Rendered just before the main frame: the two surface pieces share its
 * stacking level and have to come first to sit under its content.
 */
export function ShellDragSurface() {
  return (
    <>
      <div
        aria-hidden="true"
        data-shell-drag-surface="backdrop"
        className="hidden"
      />
      <div aria-hidden="true" data-shell-drag-surface="cap" className="hidden">
        <i />
      </div>
      <div aria-hidden="true" data-shell-drag-surface="body" className="hidden">
        <i />
      </div>
    </>
  );
}
