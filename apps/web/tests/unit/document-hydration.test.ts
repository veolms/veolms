import { afterEach, describe, expect, it } from "vitest";
import { prepareDocumentForHydration } from "../../src/bootstrap/documentHydration.ts";

describe("prepareDocumentForHydration", () => {
  afterEach(() => {
    document.documentElement
      .querySelectorAll(
        "grammarly-desktop-integration, .colortemperature-overlay, #browser-helper, #dark-mode-general-link, .native-dark-class-cloned",
      )
      .forEach((node) => node.remove());
    document.body.replaceChildren();
    for (const node of Array.from(document.head.children)) {
      if (
        node.id.startsWith("dark-mode-") ||
        node.classList.contains("native-dark-class-cloned") ||
        node.classList.contains("native-dark-class-original")
      ) {
        node.remove();
      }
      if (node instanceof HTMLLinkElement) {
        node.classList.remove("native-dark-class-original");
        if (!node.getAttribute("class")) node.removeAttribute("class");
        node.replaceChildren();
      }
    }
  });

  it("parks nodes that precede the application root until restore", () => {
    const helper = document.createElement("div");
    helper.id = "browser-helper";
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    const routeData = document.createElement("script");
    document.body.append(helper, appRoot, routeData);

    const restore = prepareDocumentForHydration();

    expect(Array.from(document.body.children)).toEqual([appRoot, routeData]);

    restore();

    expect(Array.from(document.body.children)).toEqual([
      helper,
      appRoot,
      routeData,
    ]);
  });

  it("leaves an already normalized document unchanged", () => {
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    const routeData = document.createElement("script");
    document.body.append(appRoot, routeData);

    const restore = prepareDocumentForHydration();

    expect(Array.from(document.body.children)).toEqual([appRoot, routeData]);
    restore();
    expect(Array.from(document.body.children)).toEqual([appRoot, routeData]);
  });

  it("does nothing when the application root is absent", () => {
    const helper = document.createElement("div");
    document.body.append(helper);

    const restore = prepareDocumentForHydration();

    expect(Array.from(document.body.children)).toEqual([helper]);
    restore();
    expect(Array.from(document.body.children)).toEqual([helper]);
  });

  it("unwraps Dark Mode stylesheet clones that would fail document hydration", () => {
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    document.body.append(appRoot);

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/src/full-app.css";
    stylesheet.className = "native-dark-class-original";
    const cloned = document.createElement("style");
    cloned.className = "native-dark-class-cloned";
    cloned.setAttribute("lang", "en");
    cloned.setAttribute("type", "text/css");
    cloned.setAttribute("native-dark-index", "0");
    stylesheet.append(cloned);
    document.head.append(stylesheet);

    const restore = prepareDocumentForHydration();
    const liveStylesheet = document.head.querySelector(
      'link[rel="stylesheet"][href$="/src/full-app.css"]',
    );

    expect(liveStylesheet).not.toBe(stylesheet);
    expect(liveStylesheet).not.toBeNull();
    expect(liveStylesheet?.hasAttribute("class")).toBe(false);
    expect(liveStylesheet?.childNodes).toHaveLength(0);
    expect(cloned.parentNode).toBe(stylesheet);

    restore();

    expect(cloned.parentNode).toBe(document.head);
  });

  it("parks html-level extension hosts such as Grammarly", () => {
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    document.body.append(appRoot);

    const grammarly = document.createElement("grammarly-desktop-integration");
    document.documentElement.append(grammarly);

    const restore = prepareDocumentForHydration();

    expect(grammarly.parentNode).toBeNull();
    expect(Array.from(document.documentElement.children)).toEqual([
      document.head,
      document.body,
    ]);

    restore();

    expect(grammarly.parentNode).toBe(document.documentElement);
  });
});
