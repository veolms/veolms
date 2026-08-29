# Discussion Thread Design QA

## Source of truth

- Reference: `C:/Users/anura/Downloads/ChatGPT Image Aug 28, 2026, 06_47_12 PM.png`
- Implemented view: `C:/Users/anura/.codex/visualizations/2026/08/26/01a03c55-b6c8-7c61-baac-61c38dfdcd4d/discussion-thread-no-card.png`
- Comparison: the reference and latest implementation capture were opened together during final QA.
- Captured state: TypeScript learning page, dark reading mode, Ashi Singh note thread open.

The reference uses a wider source viewport and includes one additional sample reply. The implementation comparison therefore evaluates panel proportions, hierarchy, material, spacing, and editor placement rather than matching the reference's mock data count.

## Fidelity review

- Layout: The panel enters from the right as a non-modal working window, leaves the lesson available for interaction, and becomes edge-to-edge on phone-sized layouts.
- Surface: The implementation uses a 92% dark translucent material, restrained border, deep shadow, and theme-aware glow in the top-right corner. The bounded drawer viewport lets the shared 14px glass filter blur the remaining lesson light behind it instead of exposing readable shapes.
- Hierarchy: The back action and title lead the panel, the root comment remains an edge-to-edge text block without a card surface, replies use quiet divided rows, and the reply editor is anchored at the bottom.
- Typography and spacing: Names, timestamps, body copy, engagement actions, avatars, and row spacing use the existing learning-page typography and density while following the reference's hierarchy. The compact 56px header and thread body share the lesson comment's 16px outer gutter, with a tighter 12px interval between the header and first comment.
- Editor: The existing Atomic rich-text editor and formatting toolbar are reused instead of introducing a separate reply editor.

## Interaction and responsive checks

- Clicking the body of a comment opens its thread.
- Clicking any Reply action opens the same thread and focuses its composer.
- Swiper owns horizontal movement between available discussion threads, including touch swipes on phones without competing with the outer drawer gesture.
- The desktop/tablet panel can be resized by pointer or keyboard without turning the resize gesture into a hidden close action.
- The phone layout is non-resizable, fills the available viewport edge to edge, and uses visual-viewport height so the composer remains usable with an on-screen keyboard.
- The reply list scrolls without exposing a second scrollbar track.
- The desktop panel stays open during outside interaction and closes from its back button or Escape. Its outer drawer ignores rightward dismiss gestures so horizontal swipes remain reserved for moving between discussion threads.

## Comparison history

1. First pass matched the reference structure, but the editor toolbar overflowed beneath the panel at the captured viewport.
2. The composer was converted to a fixed-height grid so its editor and controls remain fully inside the panel.
3. The thread scroll track was hidden to match the clean reference surface, and mobile width calculation was corrected to use the actual layout width.
4. Final desktop and mobile browser checks found no actionable P0, P1, or P2 visual differences.
5. The root entry card surface was removed per the annotated refinement, phone sizing was tightened to the full layout viewport, and a real horizontal touch drag successfully advanced to the next discussion without dismissing the panel.
6. The modal page dimmer was removed, the panel glass was darkened to 92%, and the viewport clipping was changed so its backdrop filter can actually sample the lesson. The panel is positioned inside that bounded viewport so horizontal entrance and exit motion stays underneath the curriculum menu. Its surface anchor stays synchronized while closed and freezes for the full open/close session. Desktop motion now bypasses the drawer's compound transform and swipe variables entirely: one independent `translate` transition eases the panel into place and carries it directly off-screen on dismissal, without scale, spring, or a trailing transform correction. Fullscreen bounds remain frozen through dismissal, and explicit viewport resizing still updates the panel. The header divider is optically centered between the arrow glyph and title.

## Final result

passed
