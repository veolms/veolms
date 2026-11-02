/**
 * How far below the bar's line the first section stands, and an open
 * section's heading holds (the list's top padding, learning.css).
 */
export const STICKY_BAR_GAP = 10;
/** Over its last this many px of travel the bar takes on its held form. */
export const BAR_APPROACH_PX = 48;
/** On <html> while the head's script keeps the panel in place. */
export const CURRICULUM_EARLY_HOLDING_ATTRIBUTE = "data-curriculum-early";
/** On <html> once the head's script has put the panel at the lesson. */
export const CURRICULUM_EARLY_PLACED_ATTRIBUTE = "data-curriculum-early-placed";
/**
 * Sent on the document once useStuckSectionHeadings keeps the bar and the
 * headings: the head's script stops then.
 */
export const CURRICULUM_HELD_EVENT = "veo:curriculum-held";

/**
 * Runs in the document's head. A lesson page is built ahead of time with
 * its curriculum, the lesson's own section open and the lesson marked, and
 * the browser draws that before the page's scripts run, with the list at
 * its top and the bar of chips in its loose form; the app then moved the
 * list to the lesson (`revealAtTop` in Curriculum.tsx) and brought the bar
 * to hold (useStuckSectionHeadings), which a reload showed as the list
 * scrolling and, a moment later, the two chips joining.
 *
 * So the list is put at the lesson as the browser reads the page, before
 * it is first drawn, with the bar and the lesson's heading in the form the
 * app gives them there: the bar held (`--bar-stick`, `data-stuck`, as far
 * as the list's position brings it), the lesson under its heading's line
 * with a list gap between (`measureItemTop`), and the heading's frame cut
 * at its foot (`--frame-clip-top`). The app finds them as it would set
 * them, so nothing moves when it takes over. A lesson too near the end to
 * reach the top is left where the list can go; the app adds the room under
 * it as before. A list that is not shown (the phone's drawer) is left
 * alone. While the page loads it keeps them so (see below), until the app
 * takes over. It is embedded as text, so it reads nothing from outside
 * itself but its arguments.
 */
function placeCurriculumAtLesson(
  barGap: number,
  barApproach: number,
  holdingAttribute: string,
  placedAttribute: string,
  heldEvent: string,
) {
  try {
    if (!/^\/learn\//.test(location.pathname)) return;
    const place = (): boolean => {
      const lesson = document.querySelector<HTMLElement>(
        ".learning-curriculum [data-curriculum-lesson-card][data-active] > button, .learning-curriculum .learning-curriculum__lesson.is-active",
      );
      const panel = lesson?.closest<HTMLElement>(".learning-curriculum");
      if (!lesson || !panel || panel.clientHeight === 0) return false;
      const list = lesson.closest<HTMLElement>(".flex.flex-col");
      const gap = list
        ? Number.parseFloat(getComputedStyle(list).rowGap) || 0
        : 0;
      const bar = panel.querySelector<HTMLElement>(
        ":scope > [data-curriculum-sticky-bar]",
      );
      const heading =
        lesson
          .closest(".learning-curriculum__section")
          ?.querySelector<HTMLElement>(
            ":scope > .learning-curriculum__section-toggle",
          ) ?? null;
      const holds =
        heading && getComputedStyle(heading).position === "sticky"
          ? heading
          : null;
      const holdBar = (stick: number) => {
        if (!bar) return;
        bar.style.setProperty("--bar-stick", stick.toFixed(3));
        if (stick >= 1) bar.dataset.stuck = "";
        else delete bar.dataset.stuck;
      };
      const panelTop = () => panel.getBoundingClientRect().top;
      const go = () => {
        const target = Math.max(
          0,
          lesson.getBoundingClientRect().top -
            panelTop() +
            panel.scrollTop -
            gap -
            (holds
              ? (Number.parseFloat(getComputedStyle(holds).top) || 0) +
                holds.offsetHeight
              : bar
                ? bar.offsetHeight
                : 0),
        );
        panel.scrollTop = target;
        return target;
      };

      // Held, as it is wherever a lesson stands at the top; then as far
      // as where the list could go brings it (a lesson near the start).
      holdBar(1);
      let target = go();
      const head = bar?.previousElementSibling;
      if (bar && head) {
        const stick = Math.min(
          1,
          Math.max(
            0,
            1 -
              (head.getBoundingClientRect().bottom - panelTop()) / barApproach,
          ),
        );
        if (stick < 1) {
          holdBar(stick);
          target = go();
        }
      }

      const frame = holds?.nextElementSibling as HTMLElement | null;
      const section = holds?.parentElement;
      if (holds && frame && section) {
        const hiddenAt = bar
          ? bar.getBoundingClientRect().bottom
          : panelTop() + barGap;
        const headingBounds = holds.getBoundingClientRect();
        if (
          section.getBoundingClientRect().top < hiddenAt + barGap - 0.5 &&
          headingBounds.bottom > hiddenAt
        ) {
          frame.style.setProperty(
            "--frame-clip-top",
            `${Math.max(0, headingBounds.bottom - frame.getBoundingClientRect().top)}px`,
          );
        }
      }
      // Done once the list stands there; short of it, more of the list is
      // still to come.
      return Math.abs(panel.scrollTop - target) <= 1;
    };
    // Until the app holds them, the bar and the headings change without
    // their transitions: the bar is first styled loose, before the lesson
    // has been read, and must not be seen fading into its held form.
    const root = document.documentElement;
    const style = document.createElement("style");
    style.textContent =
      ":root[" +
      holdingAttribute +
      "] .learning-curriculum :is([data-curriculum-sticky-bar],[data-curriculum-sticky-bar] *,.learning-curriculum__section-toggle){transition:none!important}" +
      // Until it stands at the lesson, the list is out of sight (the
      // panel's frame stays): a page read in parts can be drawn before the
      // lesson has arrived, and would show the list's top first.
      ":root[" +
      holdingAttribute +
      "]:not([" +
      placedAttribute +
      "]) .learning-workspace .learning-curriculum>*{visibility:hidden}" +
      // The open section's lessons are drawn in full meanwhile. They are
      // left undrawn while out of sight (content-visibility, kept cheap on
      // a long course), and the list is first laid out at its top: moved
      // to the lesson, they showed as blank cards of a guessed height for
      // a frame, then filled in at their own and moved what was below.
      ":root[" +
      holdingAttribute +
      "] .learning-curriculum .learning-curriculum__section[data-expanded=true] *{content-visibility:visible!important}";
    document.head.appendChild(style);
    root.setAttribute(holdingAttribute, "");

    // While the page loads, what is above the lesson can still change
    // height (the lessons' own sizes settle as the page's styles and fonts
    // come in), which moves the frame under its heading: the list, the
    // bar and the frame's cut are placed again before each such frame is
    // drawn, until the app holds them itself (`heldEvent`, sent by
    // useStuckSectionHeadings) or the learner takes the list.
    let resizeObserver: ResizeObserver | null = null;
    let done = false;
    const follow = () => {
      if (done || resizeObserver || typeof ResizeObserver !== "function")
        return;
      const panel = document.querySelector(".learning-curriculum");
      if (!panel) return;
      resizeObserver = new ResizeObserver(() => {
        place();
      });
      resizeObserver.observe(panel);
      panel
        .querySelectorAll(
          ".learning-curriculum__lesson-list, .learning-curriculum__section[data-expanded='true'] > .learning-curriculum__section-toggle + *",
        )
        .forEach((element) => resizeObserver?.observe(element));
    };
    const placed = () => root.setAttribute(placedAttribute, "");
    const observer = new MutationObserver(() => {
      if (place()) {
        placed();
        observer.disconnect();
        follow();
      }
    });
    const stopEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    const stop = () => {
      if (done) return;
      done = true;
      placed();
      observer.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener(heldEvent, stop);
      stopEvents.forEach((type) =>
        document.removeEventListener(type, stop, true),
      );
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.removeAttribute(holdingAttribute)),
      );
    };
    document.addEventListener(heldEvent, stop);
    stopEvents.forEach((type) =>
      document.addEventListener(type, stop, { capture: true, passive: true }),
    );
    window.addEventListener("load", () => setTimeout(stop, 10000));

    if (place()) {
      placed();
      follow();
    } else {
      observer.observe(root, { childList: true, subtree: true });
    }
    document.addEventListener("DOMContentLoaded", () => {
      observer.disconnect();
      if (done) return;
      place();
      placed();
      follow();
    });
  } catch {
    // The app moves the list to the lesson, as before.
  }
}

/** Runs from the document's head (see root.tsx). */
export const getCurriculumEarlyScrollScript = () =>
  `(${placeCurriculumAtLesson.toString()})(${JSON.stringify(STICKY_BAR_GAP)},${JSON.stringify(BAR_APPROACH_PX)},${JSON.stringify(CURRICULUM_EARLY_HOLDING_ATTRIBUTE)},${JSON.stringify(CURRICULUM_EARLY_PLACED_ATTRIBUTE)},${JSON.stringify(CURRICULUM_HELD_EVENT)});`;
