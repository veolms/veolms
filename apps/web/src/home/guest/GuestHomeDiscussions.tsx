import type { PublicPopularDiscussion } from "@veolms/contracts";
import { HOME_PAGE_DISCUSSIONS_PER_PAGE } from "@veolms/contracts/home-page-defaults";
import { useState } from "react";
import type { NavigateTo } from "../../routing/navigation";
import {
  GuestHomeCommentCardContent,
  getGuestHomeCommentDestination,
  guestHomeCommentCardClass,
} from "./GuestHomeCommentCard";
import { GuestHomeLink } from "./GuestHomeLink";
import { GuestHomeSectionHeader } from "./GuestHomeSectionHeader";
import { guestHomeCommentGridBleed } from "./guestHomeSpacing";

/**
 * The guest home's student comments: one card per student, each a link into
 * the lesson the comment belongs to. It deliberately shares nothing with the
 * discussions workspace, so the public home page does not load that
 * feature's code and styles for a static preview.
 *
 * A page of cards shows at first and "Load More" reveals the next page from
 * the comments the page already holds, so it asks for nothing. The page as
 * built carries only the first page of them; the rest arrive with the home
 * page's own request once the browser is idle, and the button appears then.
 */
const commentCard = guestHomeCommentCardClass;

const commentGrid = `mt-5 grid grid-cols-1 gap-4 @xl/comments:grid-cols-2 @4xl/comments:grid-cols-3 @4xl/comments:gap-5 ${guestHomeCommentGridBleed}`;

export function GuestHomeDiscussions({
  title,
  discussions,
  isLoading = false,
  onNavigatePage,
}: {
  title: string;
  discussions: readonly PublicPopularDiscussion[];
  isLoading?: boolean;
  onNavigatePage: NavigateTo;
}) {
  const [shownCount, setShownCount] = useState(HOME_PAGE_DISCUSSIONS_PER_PAGE);
  const shown = discussions.slice(0, shownCount);

  return (
    <section
      aria-labelledby="guest-home-discussions-title"
      className="@container/comments min-w-0"
    >
      <GuestHomeSectionHeader id="guest-home-discussions-title" title={title} />

      {isLoading ? (
        <div aria-hidden="true" className={`animate-pulse ${commentGrid}`}>
          {Array.from(
            { length: HOME_PAGE_DISCUSSIONS_PER_PAGE },
            (_, index) => (
              <div key={index} className={`grid gap-4 ${commentCard}`}>
                <span className="flex items-center gap-3">
                  <span className="size-11 shrink-0 rounded-full bg-(--track)" />
                  <span className="grid flex-1 gap-2">
                    <span className="h-3.5 w-2/5 rounded bg-(--track)" />
                    <span className="h-3 w-1/4 rounded bg-(--track)" />
                  </span>
                </span>
                <span className="grid gap-2">
                  <span className="h-3.5 w-full rounded bg-(--track)" />
                  <span className="h-3.5 w-11/12 rounded bg-(--track)" />
                  <span className="h-3.5 w-3/5 rounded bg-(--track)" />
                </span>
              </div>
            ),
          )}
        </div>
      ) : discussions.length === 0 ? (
        <p
          role="status"
          className="mt-5 border-y border-[color-mix(in_srgb,var(--text)_10%,transparent)] py-8 text-center text-sm text-(--muted)"
        >
          No student comments yet. Check back soon.
        </p>
      ) : (
        <>
          <ul className={commentGrid}>
            {shown.map((discussion) => {
              return (
                <li key={discussion.id} className="min-w-0">
                  <GuestHomeLink
                    href={getGuestHomeCommentDestination(discussion)}
                    onNavigatePage={onNavigatePage}
                    navigationOptions={{ exact: true }}
                    className={`flex h-full flex-col gap-4 transition-shadow duration-150 hover:shadow-(--card-hover-shadow,var(--raised-surface-shadow)) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) motion-reduce:transition-none ${commentCard}`}
                  >
                    <GuestHomeCommentCardContent discussion={discussion} />
                  </GuestHomeLink>
                </li>
              );
            })}
          </ul>
          {discussions.length > shownCount ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() =>
                  setShownCount(
                    (count) => count + HOME_PAGE_DISCUSSIONS_PER_PAGE,
                  )
                }
                className="inline-flex min-h-10 items-center rounded-lg bg-[color-mix(in_srgb,var(--text)_9%,transparent)] px-5 text-sm font-semibold text-(--text) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                Load More
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
