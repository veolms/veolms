/**
 * The grip in the middle of the gutter between the lesson and the course
 * content. It only shows where to grab: the rail around it (`group/rail`)
 * owns the pointer and keyboard handling, so the whole gutter resizes.
 *
 * The gutter is empty at rest. The grip appears, muted, while the gutter is
 * hovered (or has keyboard focus), and grows and takes the accent colour
 * only once a drag is under way.
 */
export function CurriculumResizeGrip() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none block h-16 w-1 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_54%,var(--border))] opacity-0 transition-[height,opacity,background-color] duration-160 ease-out group-hover/rail:opacity-50 group-focus-visible/rail:opacity-50 motion-reduce:transition-none [.is-curriculum-resizing_&]:h-20 [.is-curriculum-resizing_&]:bg-(--accent) [.is-curriculum-resizing_&]:opacity-100"
    />
  );
}
