/**
 * React for React exercises' page frames. Bundled on its own as one classic
 * script (imported with `?worker&url`, which Vite builds as a single IIFE
 * file); the page fetches it once and writes it into each sandboxed frame,
 * so every frame gets its own copy of React, separate from the app's.
 *
 * It is built in the same mode as the app: React's production build on the
 * live site (about 60 KB gzipped), so React's development-only warnings
 * ("each child in a list should have a unique key") do not appear there.
 */
import * as react from "react";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";

(globalThis as unknown as { __veoReact: unknown }).__veoReact = {
  react,
  reactDom,
  reactDomClient,
  jsxRuntime,
};
