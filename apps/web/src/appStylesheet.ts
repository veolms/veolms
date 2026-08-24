import fullAppStylesheet from "./full-app.css?url";

export { fullAppStylesheet };

export function activateFullAppStylesheet() {
  if (typeof document === "undefined") return Promise.resolve();

  const marker = document.querySelector<HTMLMetaElement>(
    "meta[data-full-app-css]",
  );
  if (!marker || marker.dataset.fullAppCssActive === "true")
    return Promise.resolve();

  return new Promise<void>((resolve) => {
    const link = document.createElement("link");
    const finish = () => resolve();
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    marker.dataset.fullAppCssActive = "true";
    link.href = marker.content || fullAppStylesheet;
    link.rel = "stylesheet";
    link.dataset.fullAppCssRuntime = "true";
    document.head.append(link);
    // The critical route CSS keeps the current view stable while the complete
    // interactive stylesheet is fetched. Resolve on the next frame too so an
    // interaction never waits on a slow connection.
    requestAnimationFrame(finish);
  });
}
