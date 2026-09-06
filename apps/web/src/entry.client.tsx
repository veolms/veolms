import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const hydrateApplication = () => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
};

// The generated route context is streamed through scripts at the end of the
// document. The async entry module can finish before the parser reaches those
// scripts, which briefly mounts the fallback route and then rebuilds the real
// deep link. Begin hydration as soon as parsing completes, without scheduling
// it as low-priority transition work.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrateApplication, {
    once: true,
  });
} else {
  hydrateApplication();
}
