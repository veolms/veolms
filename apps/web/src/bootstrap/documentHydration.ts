/**
 * Browsers and extensions can mutate the SSR document before React hydrates
 * it. React owns the whole <html> tree, so those mutations otherwise make it
 * claim the wrong nodes and regenerate the document.
 *
 * Detach foreign nodes for the hydration pass, then put extension styles back
 * after React has claimed the document.
 */

const DARK_MODE_ORIGINAL_CLASS = "native-dark-class-original";
const DARK_MODE_CLONED_CLASS = "native-dark-class-cloned";

const VOID_ELEMENT_TAGS = new Set([
  "AREA",
  "BASE",
  "BR",
  "COL",
  "EMBED",
  "HR",
  "IMG",
  "INPUT",
  "LINK",
  "META",
  "PARAM",
  "SOURCE",
  "TRACK",
  "WBR",
]);

const isElement = (node: Node): node is Element =>
  node.nodeType === Node.ELEMENT_NODE;

const isDarkModeInjected = (element: Element) =>
  element.classList.contains(DARK_MODE_CLONED_CLASS) ||
  element.hasAttribute("native-dark-index") ||
  element.id.startsWith("dark-mode-");

export function prepareDocumentForHydration(
  documentNode: Document | null =
    typeof document === "undefined" ? null : document,
): () => void {
  const restorers: Array<() => void> = [];
  const html = documentNode?.documentElement ?? null;
  const head = documentNode?.head ?? null;
  const body = documentNode?.body ?? null;

  if (!documentNode || !html || !body) {
    return () => {};
  }

  const park = (node: Node) => {
    const parent = node.parentNode;
    if (!parent) return;
    const nextSibling = node.nextSibling;
    parent.removeChild(node);
    restorers.push(() => {
      const host = parent.isConnected ? parent : (head ?? body);
      if (nextSibling && nextSibling.parentNode === host) {
        host.insertBefore(node, nextSibling);
        return;
      }
      host.appendChild(node);
    });
  };

  for (const link of Array.from(
    documentNode.querySelectorAll('link[rel="stylesheet"]'),
  )) {
    const hasOriginalClass = link.classList.contains(DARK_MODE_ORIGINAL_CLASS);
    const hasForeignChildren = Boolean(link.firstChild);
    if (!hasOriginalClass && !hasForeignChildren) continue;

    const clean = link.cloneNode(false) as HTMLLinkElement;
    clean.classList.remove(DARK_MODE_ORIGINAL_CLASS);
    if (!clean.getAttribute("class")) {
      clean.removeAttribute("class");
    }
    link.replaceWith(clean);

    restorers.push(() => {
      const host = clean.parentNode ?? head;
      if (!host) return;
      while (link.firstChild) {
        host.insertBefore(link.firstChild, clean.nextSibling);
      }
    });
  }

  for (const element of Array.from(html.querySelectorAll("*"))) {
    if (!VOID_ELEMENT_TAGS.has(element.tagName)) continue;
    for (const child of Array.from(element.childNodes)) {
      park(child);
    }
  }

  if (head) {
    for (const child of Array.from(head.children)) {
      if (isDarkModeInjected(child)) park(child);
    }
  }

  for (const child of Array.from(html.childNodes)) {
    if (!isElement(child)) continue;
    if (child === head || child === body) continue;
    park(child);
  }

  const appRoot = Array.from(body.children).find(
    (child): child is HTMLElement => child.id === "root",
  );
  if (appRoot) {
    while (body.firstChild && body.firstChild !== appRoot) {
      park(body.firstChild);
    }
  }

  return () => {
    for (let index = restorers.length - 1; index >= 0; index -= 1) {
      restorers[index]?.();
    }
  };
}
