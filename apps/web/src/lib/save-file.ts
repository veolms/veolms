const DOWNLOAD_FRAME_LIFETIME_MS = 60_000;

/**
 * Starts a browser download of `url`, which must answer with an attachment
 * disposition (the name the file is saved under comes from that header).
 *
 * The link is loaded in a hidden frame rather than followed from the page.
 * Several downloads started one after another each get their own frame, so
 * none cancels the one before it, and a link that fails shows its error
 * inside the frame instead of replacing the app.
 */
export function startFileDownload(url: string): void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.src = url;
  document.body.append(frame);
  // The frame only has to live until the browser has taken the download over.
  window.setTimeout(() => frame.remove(), DOWNLOAD_FRAME_LIFETIME_MS);
}
