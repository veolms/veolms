interface WebkitFullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function getDocumentFullscreenElement(
  documentTarget: Document = document,
): Element | null {
  const target = documentTarget as WebkitFullscreenDocument;
  return (
    documentTarget.fullscreenElement ?? target.webkitFullscreenElement ?? null
  );
}

export function canToggleDocumentFullscreen(
  documentTarget: Document = document,
): boolean {
  const root = documentTarget.documentElement as WebkitFullscreenElement;
  const target = documentTarget as WebkitFullscreenDocument;
  return Boolean(
    root.requestFullscreen ||
    root.webkitRequestFullscreen ||
    documentTarget.exitFullscreen ||
    target.webkitExitFullscreen,
  );
}

export async function toggleDocumentFullscreen(
  documentTarget: Document = document,
): Promise<boolean> {
  const target = documentTarget as WebkitFullscreenDocument;
  if (getDocumentFullscreenElement(documentTarget)) {
    const exit =
      documentTarget.exitFullscreen?.bind(documentTarget) ??
      target.webkitExitFullscreen?.bind(target);
    if (!exit) throw new Error("Fullscreen exit is not supported");
    await Promise.resolve(exit());
    return false;
  }

  const root = documentTarget.documentElement as WebkitFullscreenElement;
  const request =
    root.requestFullscreen?.bind(root) ??
    root.webkitRequestFullscreen?.bind(root);
  if (!request) throw new Error("Fullscreen is not supported");
  await Promise.resolve(request());
  return true;
}
