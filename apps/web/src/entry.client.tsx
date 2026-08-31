import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const hydrateApplication = () => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  });
};

declare global {
  interface Window {
    __veolmsPrerenderPaintYielded?: boolean;
  }
}

// Pre-rendered Learn documents start this module after their first paint and
// set the flag below. Other server-rendered documents still yield one paint
// here. In both cases every script downloads eagerly and hydration never waits
// for user interaction.
if (window.__veolmsPrerenderPaintYielded) {
  hydrateApplication();
} else {
  requestAnimationFrame(() => {
    window.setTimeout(hydrateApplication, 0);
  });
}
