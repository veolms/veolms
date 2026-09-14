import { useEffect, useRef, useState } from "react";

export interface DicebearAvatarProps {
  url: string;
  size: number;
  className?: string;
  onError?: () => void;
}

const DISALLOWED_TAGS = new Set(["script", "foreignobject", "iframe"]);
const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);

/** Strips anything that could execute as script from a parsed SVG tree
 * before it's inserted into the page. DiceBear's own output never contains
 * this, but the markup is third-party content shown to every viewer of a
 * profile (not just its owner), so it's sanitized on principle rather than
 * trusted outright. */
function sanitizeSvgElement(root: Element): void {
  const sanitizeAttributes = (node: Element) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
      } else if (
        URL_ATTRIBUTES.has(name) &&
        attr.value.trim().toLowerCase().startsWith("javascript:")
      ) {
        node.removeAttribute(attr.name);
      }
    }
  };

  const walk = (node: Element) => {
    sanitizeAttributes(node);
    // Snapshot first — removing a child while iterating its live sibling
    // list would skip the next one.
    for (const child of Array.from(node.children)) {
      if (DISALLOWED_TAGS.has(child.tagName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
  };
  walk(root);
}

/**
 * Fetches a DiceBear avatar and renders it as a real inline `<svg>` element
 * — crisp at any size, no `<img>` decode step — instead of `<img src=...>`.
 * Used only for the large settings preview; every other avatar spot keeps
 * `<img>`, which already renders an SVG source losslessly.
 */
export function DicebearAvatar({
  url,
  size,
  className,
  onError,
}: DicebearAvatarProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("DiceBear request failed");
        return response.text();
      })
      .then((svgText) => {
        if (cancelled) return;
        const parsed = new DOMParser().parseFromString(
          svgText,
          "image/svg+xml",
        );
        const svg = parsed.documentElement;
        if (
          svg.nodeName.toLowerCase() !== "svg" ||
          parsed.querySelector("parsererror")
        ) {
          throw new Error("Invalid SVG markup");
        }

        sanitizeSvgElement(svg);
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
        svg.removeAttribute("style");

        containerRef.current?.replaceChildren(svg);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
    };
  }, [url, size]);

  return <span ref={containerRef} className={className} aria-hidden="true" />;
}
