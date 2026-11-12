/**
 * Browser globals for the React tests: a jsdom window installed on `globalThis` before
 * React or Testing Library load. Import it first in a test file that renders React.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
const globals = globalThis as unknown as Record<string, unknown>;

globals["window"] = dom.window;
globals["document"] = dom.window.document;
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => (dom.window as unknown as Record<string, unknown>)[key],
  });
}

// Tells React these renders run inside `act()`-aware tests.
globals["IS_REACT_ACT_ENVIRONMENT"] = true;
