import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import type { PublicPopularDiscussion } from "@veolms/contracts";
import type { MouseEvent } from "react";
import { getCoursePlayerPath } from "../learning/coursePlayerNavigation";
import type { NavigateTo } from "../routing/navigation";
import { HomeSectionHeader } from "./HomePresentation";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// This list is prerendered, so its text must not depend on the reader's
// locale, time zone or the current time: a relative or locale-formatted date
// would differ from the prerendered markup and make React re-render the page.
function formatDiscussionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function getInitials(name: string) {
  const words = name.split(/\s+/u).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function getDiscussionDestination(discussion: PublicPopularDiscussion) {
  const [pathname, query = ""] = getCoursePlayerPath(discussion.courseId, 1, {
    threadId: discussion.id,
  }).split("?", 2);
  const search = new URLSearchParams(query);
  search.set("lessonId", discussion.lessonId);
  return `${pathname}?${search.toString()}`;
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The guest home's discussion list: a handful of plain links into the lesson
 * each discussion belongs to. It deliberately shares nothing with the
 * discussions workspace, so the public home page does not load that
 * feature's code and styles for a static preview.
 */
export function GuestHomeDiscussions({
  discussions,
  className,
  onNavigatePage,
}: {
  discussions: readonly PublicPopularDiscussion[];
  className?: string;
  onNavigatePage?: NavigateTo;
}) {
  return (
    <section
      aria-labelledby="popular-discussions-title"
      className={["dashboard-panel home-discussions-panel", className]
        .filter(Boolean)
        .join(" ")}
    >
      <HomeSectionHeader
        icon={ChatCircleDots}
        title="Popular Discussions"
        id="popular-discussions-title"
      />

      {discussions.length === 0 ? (
        <p className="guest-home-discussions__empty" role="status">
          No public discussions yet. Check back soon for learner conversations.
        </p>
      ) : (
        <ul className="guest-home-discussions">
          {discussions.map((discussion) => {
            const author =
              discussion.author.displayName.trim() || "Anonymous Learner";
            const title = discussion.title?.trim() || discussion.snippet;
            const destination = getDiscussionDestination(discussion);
            const date = formatDiscussionDate(discussion.updatedAt);
            const likes = pluralize(discussion.likeCount, "like", "likes");
            const replies = pluralize(
              discussion.replyCount,
              "reply",
              "replies",
            );
            const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
              if (
                !onNavigatePage ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onNavigatePage(destination, { exact: true });
            };

            return (
              <li key={discussion.id}>
                <a
                  className="guest-home-discussion"
                  href={destination}
                  onClick={handleClick}
                >
                  <span className="guest-home-discussion__avatar" aria-hidden>
                    {getInitials(author)}
                  </span>
                  <span className="guest-home-discussion__body">
                    <span className="guest-home-discussion__byline">
                      <span className="guest-home-discussion__author">
                        {author}
                      </span>
                      {date ? (
                        <time dateTime={discussion.updatedAt}>{date}</time>
                      ) : null}
                    </span>
                    <span className="guest-home-discussion__title">
                      {title}
                    </span>
                    <span className="guest-home-discussion__context">
                      {discussion.courseTitle}
                    </span>
                    <span className="guest-home-discussion__stats">
                      <span>
                        <ThumbsUp size={14} weight="fill" aria-hidden="true" />
                        {likes}
                      </span>
                      <span>
                        <ChatTeardropText size={15} aria-hidden="true" />
                        {replies}
                      </span>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
