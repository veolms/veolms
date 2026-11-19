/// <reference types="node" />
/**
 * With the video settings sheet open on a phone, a tap on the dimmed video
 * closed the sheet and also played the video (19 Nov 2026): the sheet
 * closes on the finger's `pointerup`, and the same tap's `click` then
 * reached the video under it. These tests send that tap's events to a
 * stand-in page.
 */
import assert from "node:assert/strict";
import { it } from "node:test";

import { PRESS_TAIL_EVENTS, swallowTapThrough } from "../swallowTapThrough";

/** The page: the menu's guard listens on it first, the player after. */
function page() {
  const target = new EventTarget();
  const reached: string[] = [];
  return {
    target,
    reached,
    /** Called after the guard is in place, as the player's own listeners are. */
    listenAsPlayer() {
      for (const type of ["mousedown", "mouseup", "click"]) {
        target.addEventListener(type, () => reached.push(type));
      }
    },
    tap(type: string) {
      const event = new Event(type, { cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
  };
}

it("the tap that closes the sheet does not reach the video", () => {
  const { target, reached, listenAsPlayer, tap } = page();
  swallowTapThrough({ target });
  listenAsPlayer();

  assert.equal(tap("mousedown").defaultPrevented, true);
  tap("mouseup");
  tap("click");

  assert.deepEqual(reached, [], "the video got part of the closing tap");
});

it("the next tap plays the video as usual", () => {
  const { target, reached, listenAsPlayer, tap } = page();
  swallowTapThrough({ target });
  listenAsPlayer();

  tap("click"); // the closing tap
  tap("click"); // the learner's next tap

  assert.deepEqual(reached, ["click"]);
});

it("a click elsewhere on the page still works", () => {
  const { target, reached, listenAsPlayer, tap } = page();
  swallowTapThrough({ target, isProtected: () => false });
  listenAsPlayer();

  tap("click");

  assert.deepEqual(reached, ["click"]);
});

it("steps aside when the browser sends no click", async () => {
  const { target, reached, listenAsPlayer, tap } = page();
  swallowTapThrough({ target, timeoutMs: 20 });
  listenAsPlayer();

  await new Promise((resolve) => setTimeout(resolve, 40));
  tap("click");

  assert.deepEqual(reached, ["click"]);
});

it("a press outside an open menu does not reach the video surface", () => {
  // The menu closes on the press's pointerdown; the surface plays on its
  // pointerup (and touchend on a phone).
  const target = new EventTarget();
  const reached: string[] = [];
  swallowTapThrough({ target, events: PRESS_TAIL_EVENTS });
  for (const type of ["pointerup", "touchend", "click"]) {
    target.addEventListener(type, () => reached.push(type));
  }
  for (const type of ["pointerup", "touchend", "click"]) {
    target.dispatchEvent(new Event(type, { cancelable: true }));
  }
  assert.deepEqual(reached, []);
});
