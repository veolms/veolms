import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { XIcon as X } from "@phosphor-icons/react/X";
import type {
  HomePageDiscussionSection,
  PublicPopularDiscussion,
} from "@veolms/contracts";
import {
  HOME_PAGE_DISCUSSION_COUNT,
  HOME_PAGE_DISCUSSIONS_PER_PAGE,
  HOME_PAGE_MAX_PINNED_DISCUSSIONS,
} from "@veolms/contracts/home-page-defaults";
import {
  GuestHomeCommentCardContent,
  getGuestHomeCommentDestination,
  guestHomeCommentCardClass,
  type GuestHomeComment,
} from "../home/guest/GuestHomeCommentCard";
import { learningInteractionsService } from "../services/learning-interactions/learning-interactions.service";
import {
  SettingsSection,
  TextField,
  fieldClass,
} from "./homePageSettingsControls";

/** Cards drawn at first; "Show more" adds this many again. */
const CARDS_PER_STEP = 12;

const cardGrid =
  "grid grid-cols-1 gap-4 @xl/comments:grid-cols-2 @4xl/comments:grid-cols-3";

const toolButton =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-40";
const quietButton = `${toolButton} text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)`;
const accentButton = `${toolButton} bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent)) hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]`;

/**
 * One comment as the home page shows it, with what the admin can do to it
 * underneath. Pressing the card opens the comment on its lesson, as a
 * visitor's press does, in a new tab so the settings stay open.
 */
function CommentTile({
  discussion,
  position,
  tag,
  dimmed = false,
  children,
}: {
  discussion: GuestHomeComment;
  position?: number;
  tag?: string;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      // The outline marks the card off the settings surface it sits on,
      // which shares its colour.
      className={`flex min-w-0 flex-col ${guestHomeCommentCardClass} p-0! ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)] ${dimmed ? "opacity-55" : ""}`}
    >
      <a
        href={getGuestHomeCommentDestination(discussion)}
        target="_blank"
        rel="noreferrer"
        title="Open it on its lesson"
        className="relative flex flex-1 flex-col gap-4 rounded-t-2xl p-5 pb-4 text-inherit no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
      >
        <GuestHomeCommentCardContent discussion={discussion} />
        {position !== undefined || tag ? (
          <span className="absolute top-3 right-3 flex items-center gap-1.5">
            {tag ? (
              <span className="rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-1.5 py-0.5 text-[11px] font-semibold text-(--muted)">
                {tag}
              </span>
            ) : null}
            {position !== undefined ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-1 text-[11px] font-semibold text-(--muted) tabular-nums">
                {position}
              </span>
            ) : null}
          </span>
        ) : null}
      </a>
      <div className="flex flex-wrap items-center justify-end gap-1 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2">
        {children}
      </div>
    </li>
  );
}

/**
 * Comments from any lesson, found by their words or their author, to put
 * on the home page. Reads the Discussions page's own list, public posts only.
 */
function CommentFinder({
  listedIds,
  onAdd,
  full,
}: {
  listedIds: ReadonlySet<string>;
  onAdd: (discussion: GuestHomeComment) => void;
  full: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const results = useQuery({
    queryKey: ["home-page-settings", "comment-finder", search],
    queryFn: () =>
      learningInteractionsService.listDiscussionsWorkspace({
        kind: "all",
        status: "all",
        sort: "popular",
        visibility: "public",
        search: search || undefined,
        limit: 24,
      }),
    staleTime: 60 * 1000,
  });

  const found = (results.data?.items ?? []).flatMap(
    (item): GuestHomeComment[] =>
      item.itemType === "thread" &&
      (item.kind === "comment" || item.kind === "question") &&
      item.lessonId &&
      item.visibility === "public"
        ? [
            {
              id: item.id,
              title: item.title ?? null,
              snippet: item.plainText,
              courseId: item.courseId,
              lessonId: item.lessonId,
              author: {
                displayName: item.author.displayName,
                username: item.author.username,
                avatarUrl: item.author.avatarUrl ?? null,
              },
            },
          ]
        : [],
  );

  return (
    <div className="mt-3 grid gap-3">
      {full ? (
        <p className="text-xs text-(--muted)" role="status">
          The list holds its most ({HOME_PAGE_MAX_PINNED_DISCUSSIONS}). Remove
          one to add another.
        </p>
      ) : null}
      <label className="relative block sm:max-w-md">
        <span className="sr-only">Find a comment</span>
        <MagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--muted)"
        />
        <input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search by words or student name"
          className={`${fieldClass} h-10 pl-9`}
        />
      </label>
      {results.isLoading ? (
        <p className="text-sm text-(--muted)" role="status">
          Looking for comments...
        </p>
      ) : results.isError ? (
        <p className="text-sm text-(--muted)" role="status">
          Comments could not be loaded.
        </p>
      ) : found.length === 0 ? (
        <p className="text-sm text-(--muted)" role="status">
          No public comments match.
        </p>
      ) : (
        <ul className={cardGrid}>
          {found.map((discussion) => {
            const listed = listedIds.has(discussion.id);
            return (
              <CommentTile key={discussion.id} discussion={discussion}>
                <button
                  type="button"
                  disabled={listed || full}
                  onClick={() => onAdd(discussion)}
                  className={listed ? quietButton : accentButton}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  {listed ? "On the list" : "Add to home page"}
                </button>
              </CommentTile>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * "What students say" on the home page: the cards exactly as visitors see
 * them, in their order. The admin's own list comes first; when it holds fewer
 * than the page shows, the most liked comments (one per student) fill the
 * rest on their own. Hiding keeps a comment on the list but off the page.
 */
export function DiscussionsEditor({
  section,
  onChange,
  discussions,
  optionsLoading,
}: {
  section: HomePageDiscussionSection;
  onChange: (section: HomePageDiscussionSection) => void;
  /** The listed and hidden comments first, then the most active ones. */
  discussions: readonly PublicPopularDiscussion[];
  optionsLoading: boolean;
}) {
  const [shownCount, setShownCount] = useState(CARDS_PER_STEP);
  // Comments added from the search, until the options are read again.
  const [found, setFound] = useState<ReadonlyMap<string, GuestHomeComment>>(
    () => new Map(),
  );
  const byId = useMemo(() => {
    const map = new Map<string, GuestHomeComment>(found);
    for (const discussion of discussions) map.set(discussion.id, discussion);
    return map;
  }, [discussions, found]);

  const listedIds = new Set(section.pinnedThreadIds);
  const hiddenIds = new Set(section.hiddenThreadIds);
  const listFull =
    section.pinnedThreadIds.length >= HOME_PAGE_MAX_PINNED_DISCUSSIONS;

  const listed = section.pinnedThreadIds.flatMap((id) => {
    const discussion = byId.get(id);
    return discussion && !hiddenIds.has(id) ? [discussion] : [];
  });
  // The page fills up to its usual count with the most liked comments, as
  // the API does (`resolveDiscussions`).
  const autoCount = Math.max(0, HOME_PAGE_DISCUSSION_COUNT - listed.length);
  const auto: GuestHomeComment[] = discussions
    .filter((item) => !listedIds.has(item.id) && !hiddenIds.has(item.id))
    .slice(0, autoCount);
  const onPage = [
    ...listed.map((discussion) => ({ discussion, auto: false })),
    ...auto.map((discussion) => ({ discussion, auto: true })),
  ];
  const hidden = section.hiddenThreadIds.flatMap((id) => {
    const discussion = byId.get(id);
    return discussion ? [discussion] : [];
  });

  const without = (ids: readonly string[], threadId: string) =>
    ids.filter((id) => id !== threadId);
  const add = (threadId: string) =>
    onChange({
      ...section,
      pinnedThreadIds: listedIds.has(threadId)
        ? section.pinnedThreadIds
        : [threadId, ...section.pinnedThreadIds],
      hiddenThreadIds: without(section.hiddenThreadIds, threadId),
    });
  const keep = (threadId: string) =>
    onChange({
      ...section,
      pinnedThreadIds: [...section.pinnedThreadIds, threadId],
    });
  const remove = (threadId: string) =>
    onChange({
      ...section,
      pinnedThreadIds: without(section.pinnedThreadIds, threadId),
      hiddenThreadIds: without(section.hiddenThreadIds, threadId),
    });
  const hide = (threadId: string) =>
    onChange({
      ...section,
      hiddenThreadIds: [
        ...without(section.hiddenThreadIds, threadId),
        threadId,
      ],
    });
  const show = (threadId: string) =>
    onChange({
      ...section,
      hiddenThreadIds: without(section.hiddenThreadIds, threadId),
    });

  return (
    <SettingsSection
      id="home-page-discussions-heading"
      title="Student comments"
      description="The comment cards below the courses, exactly as visitors see them. Press a card to open it on its lesson."
      visible={section.visible}
      onVisibleChange={(visible) => onChange({ ...section, visible })}
    >
      <div className="sm:max-w-md">
        <TextField
          id="home-page-discussions-title"
          label="Heading"
          value={section.title}
          onChange={(title) => onChange({ ...section, title })}
          maxLength={40}
          required
        />
      </div>

      <div className="@container/comments min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[13px] font-medium text-(--text)">
            On the home page{" "}
            <span className="font-normal text-(--muted)">
              · {onPage.length} {onPage.length === 1 ? "comment" : "comments"}
            </span>
          </h3>
          <p className="text-xs text-(--muted)">
            {listed.length} chosen
            {auto.length > 0 ? `, ${auto.length} filled in automatically` : ""}
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-(--muted)">
          Visitors see the first {HOME_PAGE_DISCUSSIONS_PER_PAGE}, then more
          with Load More. Comments you add come first. With fewer than{" "}
          {HOME_PAGE_DISCUSSION_COUNT} chosen, the most liked comments (one per
          student) fill the rest, marked Auto: keep one to fix it on the list,
          or hide it. A comment can also be added from its lesson or the
          Discussions page with &ldquo;Add to home page&rdquo;.
        </p>

        {onPage.length === 0 ? (
          <p className="mt-3 text-sm text-(--muted)" role="status">
            {optionsLoading
              ? "Loading comments..."
              : "No comments are on the home page yet."}
          </p>
        ) : (
          <>
            <ul className={`mt-4 ${cardGrid}`}>
              {onPage
                .slice(0, shownCount)
                .map(({ discussion, auto: isAuto }, index) => (
                  <CommentTile
                    key={discussion.id}
                    discussion={discussion}
                    position={index + 1}
                    tag={isAuto ? "Auto" : undefined}
                  >
                    {isAuto ? (
                      <button
                        type="button"
                        disabled={listFull}
                        onClick={() => keep(discussion.id)}
                        className={quietButton}
                        title="Keep it on your list"
                      >
                        <Plus aria-hidden="true" className="size-3.5" />
                        Keep
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => hide(discussion.id)}
                      className={quietButton}
                      title="Take it off the home page for now; it stays here"
                    >
                      <EyeSlash aria-hidden="true" className="size-3.5" />
                      Hide
                    </button>
                    {!isAuto ? (
                      <button
                        type="button"
                        onClick={() => remove(discussion.id)}
                        className={quietButton}
                        title="Take it off the list"
                      >
                        <X aria-hidden="true" className="size-3.5" />
                        Remove
                      </button>
                    ) : null}
                  </CommentTile>
                ))}
            </ul>
            {onPage.length > shownCount ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setShownCount((count) => count + CARDS_PER_STEP)
                  }
                  className={quietButton}
                >
                  Show more ({onPage.length - shownCount} left)
                </button>
              </div>
            ) : null}
          </>
        )}

        {hidden.length > 0 ? (
          <details className="mt-6">
            <summary className="cursor-pointer text-[13px] font-medium text-(--text)">
              Hidden from the home page{" "}
              <span className="font-normal text-(--muted)">
                · {hidden.length}
              </span>
            </summary>
            <ul className={`mt-3 ${cardGrid}`}>
              {hidden.map((discussion) => (
                <CommentTile
                  key={discussion.id}
                  discussion={discussion}
                  tag="Hidden"
                  dimmed
                >
                  <button
                    type="button"
                    onClick={() => show(discussion.id)}
                    className={accentButton}
                  >
                    <Eye aria-hidden="true" className="size-3.5" />
                    Show
                  </button>
                  {listedIds.has(discussion.id) ? (
                    <button
                      type="button"
                      onClick={() => remove(discussion.id)}
                      className={quietButton}
                    >
                      <X aria-hidden="true" className="size-3.5" />
                      Remove
                    </button>
                  ) : null}
                </CommentTile>
              ))}
            </ul>
          </details>
        ) : null}

        <details className="mt-6">
          <summary className="cursor-pointer text-[13px] font-medium text-(--text)">
            Add a comment from any lesson
          </summary>
          <CommentFinder
            listedIds={listedIds}
            full={listFull}
            onAdd={(discussion) => {
              setFound((current) =>
                new Map(current).set(discussion.id, discussion),
              );
              add(discussion.id);
            }}
          />
        </details>
      </div>
    </SettingsSection>
  );
}
