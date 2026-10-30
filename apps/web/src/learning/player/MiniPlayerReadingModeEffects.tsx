/**
 * Reading mode is drawn by full-viewport layers above the page. The mini
 * player is a popover, and the browser paints popovers above everything
 * else, so those layers never reach it. This repeats them inside the mini
 * window, where they pick up the same settings through the same classes.
 *
 * `absolute!` is the one override: the shared class pins the layers to the
 * viewport, and here they must cover only the mini window.
 */
export function MiniPlayerReadingModeEffects() {
  return (
    <>
      <div
        className="reading-mode-effects reading-mode-effects__texture absolute!"
        aria-hidden="true"
      />
      <div
        className="reading-mode-effects reading-mode-effects__temperature absolute!"
        aria-hidden="true"
      />
      <div
        className="reading-mode-effects reading-mode-effects__colors absolute!"
        aria-hidden="true"
      />
    </>
  );
}
