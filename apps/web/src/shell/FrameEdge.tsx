/**
 * The lit edge of a framed surface, drawn above the surface's content so
 * that sticky content cannot cover it: the shell's main frame, or the lesson
 * card the frame becomes on the desktop lesson page.
 *
 * It is the surface's inset edge shadow on a box the size of the surface,
 * painted once per edge and each time cut down to that edge's strip. A single
 * uncut box draws the same pixels, but the compositor then keeps a
 * transparent layer as large as the surface for the sake of a few 1px lines,
 * and rasters it again on every frame of a sidebar drag. On a high-density
 * Android tablet that was enough to take the drag past Chrome's tile memory
 * limit, which drew frames with parts of the page missing.
 *
 * Three details keep the strips identical to the uncut box, pixel for pixel:
 *
 * - The box matches the frame: the shell's 12px top and right insets, its
 *   10px bottom inset and its 18px corners, in pixels because the shell does
 *   not scale with the text size.
 * - The top strip is 20px deep and the bottom one 22px, which puts both cuts
 *   32px from the shell's edge. That is a whole number of device pixels at
 *   every usual display scale; a cut that lands between two pixels changes
 *   how Chrome smooths the rounded corners next to it.
 * - A strip is only cut where it meets the next one. Its outer sides are
 *   left 1px open, because the box is painted on whole device pixels and a
 *   cut along its edge is not, which shaved the line there.
 *
 * Two more keep the strips small for the compositor:
 *
 * - `will-change` gives each strip a layer of its own. Without it Chrome
 *   merges the four into one layer as large as the surface again. It names
 *   opacity, not transform: a layer expected to move is not kept on the
 *   pixel grid, and at a sidebar width that ends on half a device pixel the
 *   strips were drawn half a pixel off.
 * - The element that groups them has no box (`display: contents`). On a
 *   touch screen every box records where it can be touched, even an empty
 *   one, and a box the size of the surface drew its neighbours (the
 *   sidebar's glow) into a layer that size.
 *
 * Touch devices only. With a mouse or trackpad the uncut box still draws the
 * edge, as an `::after` overlay (foundation.css, learning-split-layout.css):
 * those screens have the memory for it, and which layers exist there also
 * decides how Chrome smooths the sidebar's icons at 125% and 150% display
 * scaling, so the strips would change pixels that have nothing to do with
 * the edge.
 */
const strip =
  "pointer-events-none absolute z-46 rounded-[18px] shadow-(--application-frame-edge-shadow) will-change-[opacity]";

const cuts = [
  "[clip-path:inset(-1px_-1px_calc(100%_-_20px)_-1px)]",
  "[clip-path:inset(20px_calc(100%_-_18px)_22px_-1px)]",
  "[clip-path:inset(20px_-1px_22px_calc(100%_-_18px))]",
  "[clip-path:inset(calc(100%_-_22px)_-1px_-1px_-1px)]",
];

const surfaces = {
  // Children of the shell, laid over the main frame. Shown in the framed
  // layout on touch devices; the desktop lesson page hides them
  // (learning-split-layout.css). The frame's left edge is a property the
  // shell does not hand down by itself (see its registration in
  // foundation.css), so each level asks.
  shell: {
    group:
      "hidden [--main-surface-inline-start:inherit] min-[641px]:pointer-coarse:[:root[data-content-layout=framed]_&]:contents",
    box: "top-[12px] right-[12px] bottom-[10px] left-(--main-surface-inline-start) [--main-surface-inline-start:inherit]",
  },
  // Children of the main frame, which is the lesson card while the desktop
  // lesson page is open. Only that page shows them, on touch devices
  // (learning-split-layout.css).
  lesson: { group: "hidden", box: "inset-0" },
};

export function FrameEdge({ surface }: { surface: keyof typeof surfaces }) {
  const { group, box } = surfaces[surface];

  return (
    <div aria-hidden="true" data-frame-edge={surface} className={group}>
      {cuts.map((cut) => (
        <span key={cut} className={`${strip} ${box} ${cut}`} />
      ))}
    </div>
  );
}
