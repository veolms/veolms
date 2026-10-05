import { useEffect } from "react";

/**
 * Links a lazy chunk's stylesheets from the document so prerendered markup is
 * styled at first paint (see routeChunkPreloads.ts).
 *
 * The in-place links belong to the page that renders them and are removed
 * with it. Vite's chunk loader, however, saw them once and never adds those
 * stylesheets again, so another page that shares one (Discussions shares the
 * home's) would then load without it. After hydration each stylesheet
 * therefore also gets a copy in <head> that outlives the page — the same
 * place and lifetime the chunk loader would have given it.
 */
export function ChunkStylesheets({ hrefs }: { hrefs: readonly string[] }) {
  useEffect(() => {
    for (const href of hrefs) {
      const alreadyInHead = [
        ...document.head.querySelectorAll<HTMLLinkElement>(
          'link[rel="stylesheet"]',
        ),
      ].some((link) => link.getAttribute("href") === href);
      if (alreadyInHead) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.append(link);
    }
  }, [hrefs]);

  // Deliberately plain in-place links (no `precedence`): React would hoist
  // those above the global stylesheets and flip the cascade.
  return hrefs.map((href) => <link key={href} rel="stylesheet" href={href} />);
}
