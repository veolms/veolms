import { useState } from "react";
import { ResponsiveAvatar } from "../../components/ResponsiveAvatar";
import { getCoursePlayerPath } from "../../learning/coursePlayerNavigation";
import { markdownToPlainText } from "../../learning/discussion-editor/types";

/**
 * One student comment card of the guest home's "What students say", shared
 * with the home page settings so admins see the cards exactly as visitors
 * do. It holds nothing from the discussions feature, so the public home page
 * does not load that code.
 */
export interface GuestHomeComment {
  id: string;
  title: string | null;
  snippet: string;
  courseId: string;
  lessonId: string;
  author: {
    displayName: string;
    username: string | null;
    avatarUrl?: string | null;
    avatarSrcSet?: Parameters<typeof ResponsiveAvatar>[0]["srcSet"];
  };
}

function getInitials(name: string) {
  const words = name.split(/\s+/u).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

const avatarFrame =
  "size-11 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]";

/** The author's profile picture, or their initials when there is none. */
function CommentAvatar({
  author,
  name,
}: {
  author: GuestHomeComment["author"];
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!author.avatarUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={`grid place-items-center text-sm font-bold tracking-wide text-(--text) ${avatarFrame}`}
      >
        {getInitials(name)}
      </span>
    );
  }
  return (
    <ResponsiveAvatar
      src={author.avatarUrl}
      srcSet={author.avatarSrcSet}
      sizes="44px"
      width={44}
      height={44}
      alt=""
      onError={() => setFailed(true)}
      className={`object-cover ${avatarFrame}`}
    />
  );
}

/** The lesson, with this comment at the top of its discussion, highlighted. */
export function getGuestHomeCommentDestination(discussion: GuestHomeComment) {
  const [pathname, query = ""] = getCoursePlayerPath(discussion.courseId, 1, {
    threadId: discussion.id,
    threadFocus: "comment",
  }).split("?", 2);
  const search = new URLSearchParams(query);
  search.set("lessonId", discussion.lessonId);
  return `${pathname}?${search.toString()}`;
}

export const guestHomeCommentCardClass =
  "rounded-2xl bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) p-5 shadow-(--raised-surface-shadow)";

/** The avatar, name and words of a comment card. */
export function GuestHomeCommentCardContent({
  discussion,
}: {
  discussion: GuestHomeComment;
}) {
  const author = discussion.author.displayName.trim() || "Anonymous Learner";
  // A snippet can be the start of a Markdown note; it is shown as the text
  // it reads as, without its `#` and `**` marks.
  const comment =
    discussion.title?.trim() || markdownToPlainText(discussion.snippet);

  return (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <CommentAvatar author={discussion.author} name={author} />
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-[0.9375rem] leading-snug font-bold text-(--text)">
            {author}
          </span>
          {discussion.author.username ? (
            <span className="truncate text-[0.8125rem] leading-snug text-(--muted)">
              @{discussion.author.username}
            </span>
          ) : null}
        </span>
      </span>
      <span className="line-clamp-6 text-[0.9375rem] leading-relaxed wrap-anywhere text-(--text-secondary,var(--text))">
        {comment}
      </span>
    </>
  );
}
