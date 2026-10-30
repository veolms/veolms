import { useEffect, useRef } from "react";

/**
 * "Reply" on a Discussions row asks the side panel to take the learner to
 * its reply box. The panel may not be showing that discussion yet (it opens
 * with the press, or is a phone sheet still on its way), so the request
 * waits until the panel with that discussion picks it up.
 *
 * The pending request and its signal live on the window, not in this
 * module: when the dev server reloads one of the two files that use it, the
 * row and the panel can hold different copies of this module, and a
 * request kept here would never reach the panel.
 */
const REQUEST_EVENT = "veolms:discussion-reply-focus";

interface ReplyFocusRequest {
  discussionId: string;
  /** Pulse the reply area too: asked again while the panel was showing it. */
  pulse: boolean;
}

interface ReplyFocusWindow extends Window {
  __veolmsPendingReplyFocus?: ReplyFocusRequest | null;
}

function replyFocusWindow(): ReplyFocusWindow | null {
  return typeof window === "undefined" ? null : (window as ReplyFocusWindow);
}

export function requestDiscussionReplyFocus(
  discussionId: string,
  { pulse = false }: { pulse?: boolean } = {},
) {
  const win = replyFocusWindow();
  if (!win) return;
  win.__veolmsPendingReplyFocus = { discussionId, pulse };
  win.dispatchEvent(new Event(REQUEST_EVENT));
}

/**
 * Calls `onRequest` when a reply to `discussionId` is asked for, once, and
 * only while `ready` (the reply box is on screen): a request made before
 * that waits for it.
 */
export function useDiscussionReplyFocus(
  discussionId: string,
  ready: boolean,
  onRequest: (request: { pulse: boolean }) => void,
) {
  const onRequestRef = useRef(onRequest);
  useEffect(() => {
    onRequestRef.current = onRequest;
  });
  useEffect(() => {
    const win = replyFocusWindow();
    if (!ready || !win) return undefined;
    const take = () => {
      const request = win.__veolmsPendingReplyFocus;
      if (request?.discussionId !== discussionId) return;
      win.__veolmsPendingReplyFocus = null;
      onRequestRef.current({ pulse: request.pulse });
    };
    // Asked for before this panel was showing the discussion.
    take();
    win.addEventListener(REQUEST_EVENT, take);
    return () => win.removeEventListener(REQUEST_EVENT, take);
  }, [discussionId, ready]);
}
