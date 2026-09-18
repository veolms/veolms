import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/Funnel";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import type { CourseRole } from "../courses/catalogue";
import {
  handleRovingTabKeyDown,
  scrollKeyboardFocusedTabIntoView,
} from "../accessibility/rovingTabFocus";
import type { NavigateTo } from "../routing/navigation";
import {
  normalizeDiscussionTab,
  rememberDiscussionTab,
} from "../routing/tabSessionState";
import type { DiscussionTab } from "../routing/tabSessionState";
import {
  useDiscussionsWorkspace,
} from "../services/learning-interactions";
import { ThemedSelect } from "../ThemedSelect";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import { DiscussionAvatar } from "../learning/DiscussionAvatar";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import type { DiscussionContent } from "../learning/discussion-editor/types";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import {
  adaptDiscussionWorkspaceItem,
  type DiscussionWorkspaceCard,
} from "./discussions-workspace.adapter";

type DiscussionStatus = DiscussionWorkspaceCard["status"];

type PageTabTone = "blue" | "green" | "gold" | "rose" | "violet";

export interface DiscussionsWorkspaceProps {
  role: CourseRole;
  tab?: string;
  onNavigatePage: NavigateTo;
  setNotice?: (message: string) => void;
}

const tabs: readonly {
  id: DiscussionTab;
  label: string;
  Icon: typeof Question;
  tone: PageTabTone;
}[] = [
  { id: "q-and-a", label: "Q&A", Icon: Question, tone: "violet" },
  {
    id: "comments",
    label: "Comments",
    Icon: ChatTeardropText,
    tone: "blue",
  },
  { id: "mentions", label: "Mentions", Icon: At, tone: "rose" },
  {
    id: "following",
    label: "Following",
    Icon: ChatCircleDots,
    tone: "green",
  },
  { id: "saved", label: "Saved", Icon: BookmarkSimple, tone: "gold" },
];

const discussionTabIds = tabs.map(({ id }) => id);

const statusLabels: Readonly<Record<DiscussionStatus, string>> = {
  answered: "Instructor answered",
  mentioned: "Mentioned you",
  solved: "Solved",
  open: "Open",
};

const statusIcons: Readonly<Record<DiscussionStatus, typeof CheckCircle>> = {
  answered: CheckCircle,
  mentioned: At,
  solved: SealCheck,
  open: ChatCircleDots,
};

function DiscussionComposer({
  kind,
  onCancel,
  onPublish,
}: {
  kind: "question" | "discussion";
  onCancel: () => void;
  onPublish: (
    kind: "question" | "discussion",
    title: string,
    content: string,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onPublish(kind, title.trim(), content.trim());
  };

  return (
    <form className="discussion-hub__composer" onSubmit={submit}>
      <div className="discussion-hub__composer-heading">
        <div>
          <strong>
            {kind === "question" ? "Ask a question" : "Start a discussion"}
          </strong>
          <span>
            Share enough context to help classmates give a useful answer.
          </span>
        </div>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <label>
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            kind === "question"
              ? "What would you like help with?"
              : "What should the discussion cover?"
          }
          autoFocus
        />
      </label>
      <label>
        <span>Details</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Add the course context, what you tried, or the idea you want to explore."
          rows={3}
        />
      </label>
      <div className="discussion-hub__composer-actions">
        <span>Posts are visible to people learning this course.</span>
        <button type="submit" disabled={!title.trim() || !content.trim()}>
          <PaperPlaneTilt size={17} weight="fill" /> Publish
        </button>
      </div>
    </form>
  );
}

const QUESTION_PREVIEW_MAX_HEIGHT_PX = 48;

function DiscussionWorkspaceQuestionContent({
  thread,
  expanded,
  onExpandedChange,
}: {
  thread: DiscussionWorkspaceCard;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [needsClamp, setNeedsClamp] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const content = useMemo<DiscussionContent>(
    () => ({
      format: "markdown",
      markdown: thread.content.trim() || thread.plainText,
      plainText: thread.plainText,
    }),
    [thread.content, thread.plainText],
  );

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;

    const measure = () => {
      setNeedsClamp(node.scrollHeight > QUESTION_PREVIEW_MAX_HEIGHT_PX + 4);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [content]);

  return (
    <div className="discussion-hub__question-content">
      <div className="relative">
        <div
          ref={contentRef}
          className="discussion-hub__question-markdown overflow-hidden transition-[max-height] duration-300 ease-in-out"
          style={
            needsClamp && !expanded
              ? { maxHeight: `${QUESTION_PREVIEW_MAX_HEIGHT_PX}px` }
              : undefined
          }
        >
          <DiscussionMarkdown
            content={content}
            label={`Question by ${thread.author}`}
            className="max-w-none"
          />
        </div>
        {needsClamp && !expanded && (
          <div
            aria-hidden="true"
            className="discussion-hub__question-fade pointer-events-none absolute bottom-0 left-0 right-0 h-8"
          />
        )}
      </div>
      {needsClamp && (
        <button
          type="button"
          className="discussion-hub__question-toggle"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function getAttachmentLabel(
  summary: DiscussionWorkspaceCard["attachmentSummary"],
): string | null {
  if (summary.count === 0) return null;
  if (summary.count > 1) return `${summary.count} attachments`;
  const classifiedTypes = [
    summary.hasImages,
    summary.hasVideos,
    summary.hasFiles,
  ].filter(Boolean).length;
  if (classifiedTypes !== 1) return "1 attachment";
  if (summary.hasImages) return "Image attached";
  if (summary.hasVideos) return "Video attached";
  if (summary.hasFiles) return "File attached";
  return "1 attachment";
}

function getVisibilityLabel(
  visibility: DiscussionWorkspaceCard["visibility"],
): string | null {
  if (!visibility) return null;
  return visibility.charAt(0).toUpperCase() + visibility.slice(1);
}

function DiscussionWorkspaceAttachmentIndicator({
  label,
}: {
  label: string;
}) {
  return (
    <span className="discussion-thread__attachment inline-flex items-center gap-1.5 text-xs text-(--muted)">
      <Paperclip size={15} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function DiscussionWorkspaceQuestionCard({
  thread,
  setNotice,
}: {
  thread: DiscussionWorkspaceCard;
  setNotice?: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const attachmentLabel = getAttachmentLabel(thread.attachmentSummary);
  const visibilityLabel = getVisibilityLabel(thread.visibility);
  const lifecycleStatus = thread.status === "solved" ? "solved" : "open";
  const LifecycleIcon = statusIcons[lifecycleStatus];

  return (
    <article
      className={`discussion-thread discussion-thread--question ${
        expanded ? "is-expanded" : "is-collapsed"
      }`}
    >
      <div className="discussion-thread__open discussion-thread__open--overview">
        <div className="discussion-thread__avatar">
          <DiscussionAvatar
            src={thread.avatar || null}
            className="discussion-thread__avatar-image"
          />
        </div>
        <div className="discussion-thread__body">
          <div className="discussion-thread__author">
            <span>{thread.isOwn ? "You" : thread.author}</span>
            {thread.authorUsername && (
              <>
                <span aria-hidden="true">·</span>
                <span>@{thread.authorUsername.replace(/^@+/, "")}</span>
              </>
            )}
          </div>
          <DiscussionWorkspaceQuestionContent
            thread={thread}
            expanded={expanded}
            onExpandedChange={setExpanded}
          />
          {(thread.course ||
            thread.lesson ||
            attachmentLabel ||
            visibilityLabel) && (
            <div className="discussion-thread__context">
              {thread.course && <span>{thread.course}</span>}
              {thread.course &&
                (thread.lesson || attachmentLabel || visibilityLabel) && (
                  <span aria-hidden="true" />
                )}
              {thread.lesson && <small>{thread.lesson}</small>}
              {thread.lesson && (attachmentLabel || visibilityLabel) && (
                <span aria-hidden="true" />
              )}
              {attachmentLabel && (
                <DiscussionWorkspaceAttachmentIndicator label={attachmentLabel} />
              )}
              {attachmentLabel && visibilityLabel && (
                <span aria-hidden="true" />
              )}
              {visibilityLabel && (
                <small className="discussion-thread__visibility">
                  {visibilityLabel}
                </small>
              )}
            </div>
          )}
        </div>
        <div className="discussion-thread__meta">
          <span
            className={`discussion-thread__status is-${lifecycleStatus}`}
          >
            <span className="discussion-thread__status-label">
              <LifecycleIcon size={15} weight="fill" aria-hidden="true" />
              <span>{statusLabels[lifecycleStatus]}</span>
            </span>
            {thread.isLocked && (
              <span
                className="discussion-thread__lock"
                aria-label="Locked"
                title="Locked"
              >
                <Lock size={12} weight="bold" aria-hidden="true" />
              </span>
            )}
          </span>
          <span>
            <ChatTeardropText size={17} /> {thread.replies}{" "}
            {thread.replies === 1 ? "reply" : "replies"}
          </span>
          <time>{thread.activity}</time>
        </div>
      </div>
      <button
        type="button"
        className="discussion-thread__more"
        aria-label="More options for question"
        onClick={() => {
          setNotice?.(
            "Thread actions will be available with connected discussions.",
          );
        }}
      >
        <DotsThreeVertical size={21} weight="bold" />
      </button>
    </article>
  );
}

export function DiscussionsWorkspace({
  tab = "q-and-a",
  onNavigatePage,
  setNotice,
}: DiscussionsWorkspaceProps) {
  const activeTab = normalizeDiscussionTab(tab);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCourseId = searchParams.get("course") ?? "all";
  const navigateTab = (id: DiscussionTab) => {
    rememberDiscussionTab(id);
    const nextSearch = new URLSearchParams();
    if (selectedCourseId !== "all") nextSearch.set("course", selectedCourseId);
    const suffix = nextSearch.toString();
    onNavigatePage(`/discussions/${id}${suffix ? `?${suffix}` : ""}`, {
      preserveScroll: true,
    });
  };
  const tablistRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fetchingNextPageRef = useRef(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, DEFAULT_DEBOUNCE_DELAY_MS);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("activity");
  const [composer, setComposer] = useState<"question" | "discussion" | null>(
    null,
  );

  const workspaceQuery = useMemo(
    () => ({
      tab: activeTab,
      ...(selectedCourseId !== "all" ? { courseId: selectedCourseId } : {}),
      ...(debouncedQuery.trim() ? { search: debouncedQuery.trim() } : {}),
      ...(activeTab === "q-and-a" ? { mine: true } : {}),
      status: status as "all" | "answered" | "mentioned" | "solved" | "open",
      sort: sort as "activity" | "replies",
      limit: 20,
    }),
    [activeTab, debouncedQuery, selectedCourseId, sort, status],
  );
  const workspaceQueryResult = useDiscussionsWorkspace(workspaceQuery);
  const {
    data: workspaceData,
    error: workspaceError,
    isPending: isWorkspacePending,
    isError: isWorkspaceError,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = workspaceQueryResult;

  const cards = useMemo(
    () =>
      workspaceData?.pages
        .flatMap((page) => page.items)
        .map(adaptDiscussionWorkspaceItem) ?? [],
    [workspaceData],
  );

  const courseOptions = useMemo(() => {
    const courses = new Map<string, string>();
    workspaceData?.pages.forEach((page) => {
      page.courses.forEach((courseOption) => {
        courses.set(courseOption.id, courseOption.title);
      });
    });
    return [
      ["all", "Course"] as const,
      ...Array.from(courses, ([id, title]) => [id, title] as const),
    ];
  }, [workspaceData]);

  const setCourse = (courseId: string) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (courseId === "all") next.delete("course");
        else next.set("course", courseId);
        return next;
      },
      { replace: true },
    );
  };

  const loadMore = useCallback(() => {
    if (
      !hasNextPage ||
      isFetchingNextPage ||
      fetchingNextPageRef.current
    ) {
      return;
    }
    fetchingNextPageRef.current = true;
    void fetchNextPage().finally(() => {
      fetchingNextPageRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (
      !sentinel ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError
    ) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      {
        root: document.getElementById("courses-main-scrollport"),
        rootMargin: "600px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchNextPageError, isFetchingNextPage, loadMore]);

  useEffect(() => {
    rememberDiscussionTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const tablist = tablistRef.current;
    if (!tablist || !tablist.contains(document.activeElement)) return undefined;

    const activeTabButton = document.getElementById(
      `discussion-tab-${activeTab}`,
    );
    if (activeTabButton === document.activeElement) return undefined;

    const frame = window.requestAnimationFrame(() => {
      activeTabButton?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  const publish = (
    kind: "question" | "discussion",
    title: string,
    excerpt: string,
  ) => {
    const destinationTab: DiscussionTab =
      kind === "question" ? "q-and-a" : "comments";

    void title;
    void excerpt;
    setComposer(null);
    navigateTab(destinationTab);
    setNotice?.(
      "Publishing is not connected in this phase.",
    );
  };

  const openThread = (thread: DiscussionWorkspaceCard) => {
    setNotice?.(`Opened “${thread.title}”.`);
  };

  return (
    <div className="discussion-hub" aria-labelledby="discussions-title">
      <header className="discussion-hub__header">
        <div>
          <h1 id="discussions-title">Discussions</h1>
          <p>Bring course conversations, questions, and replies together.</p>
        </div>
        <span className="discussion-hub__header-icon" aria-hidden="true">
          <ChatCircleDots size={28} weight="duotone" />
        </span>
      </header>

      <nav
        ref={tablistRef}
        className="discussion-hub__tabs page-tabs"
        aria-label="Discussion views"
        role="tablist"
      >
        {tabs.map(({ id, label, Icon, tone }) => (
          <button
            type="button"
            key={id}
            id={`discussion-tab-${id}`}
            role="tab"
            aria-selected={activeTab === id}
            aria-controls="discussion-panel"
            data-page-tab-tone={tone}
            data-swipe-tab-id={id}
            data-fixed-radius
            tabIndex={activeTab === id ? 0 : -1}
            className={`rounded-none! ${activeTab === id ? "is-active" : ""}`}
            onClick={() => navigateTab(id)}
            onKeyDown={handleRovingTabKeyDown}
            onFocus={scrollKeyboardFocusedTabIntoView}
          >
            <Icon size={19} weight={activeTab === id ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
        <span className="page-tabs__indicator" aria-hidden="true" />
      </nav>

      <SwipeableTabPanel
        tabs={discussionTabIds}
        activeTab={activeTab}
        onTabChange={navigateTab}
        tabListRef={tablistRef}
        id="discussion-panel"
        labelledBy={`discussion-tab-${activeTab}`}
        slideClassName="pb-8"
        stateAttribute="data-discussion-tab"
      >
        {(_panelTab, preview) => (
          <>
            {composer && !preview && (
              <DiscussionComposer
                kind={composer}
                onCancel={() => setComposer(null)}
                onPublish={publish}
              />
            )}

            <div className="discussion-hub__layout">
              <main className="discussion-hub__feed">
                <section
                  className="discussion-hub__filters"
                  aria-label="Filter discussions"
                >
                  <label className="discussion-hub__search">
                    <MagnifyingGlass size={19} aria-hidden="true" />
                    <span className="sr-only">Search discussions</span>
                    <input
                      id="workspace-discussions-search-input"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search discussions by title or keyword..."
                      data-search-shortcut-target
                      aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
                    />
                    <SearchShortcutHint />
                  </label>
                  <div className="discussion-hub__select">
                    <ThemedSelect
                      onValueChange={setCourse}
                      ariaLabel="Filter discussions by course"
                      triggerClassName="discussion-hub__select-trigger"
                      contentClassName="discussion-hub__select-content"
                      value={selectedCourseId}
                      options={courseOptions}
                    />
                  </div>
                  <div className="discussion-hub__select">
                    <ThemedSelect
                      value={status}
                      onValueChange={setStatus}
                      ariaLabel="Filter discussions by status"
                      triggerClassName="discussion-hub__select-trigger"
                      contentClassName="discussion-hub__select-content"
                      options={
                        [
                          ["all", "Status"],
                          ["answered", "Answered"],
                          ["mentioned", "Mentioned"],
                          ["solved", "Solved"],
                          ["open", "Open"],
                        ] as const
                      }
                    />
                  </div>
                  <div className="discussion-hub__select discussion-hub__select--sort">
                    <Funnel size={17} aria-hidden="true" />
                    <ThemedSelect
                      value={sort}
                      onValueChange={setSort}
                      ariaLabel={`Sort discussions: ${
                        sort === "activity"
                          ? "Latest activity"
                          : sort === "replies"
                            ? "Most replies"
                            : "Newest"
                      }`}
                      triggerClassName="discussion-hub__select-trigger"
                      contentClassName="discussion-hub__select-content"
                      options={
                        [
                          ["activity", "Latest activity"],
                          ["replies", "Most replies"],
                        ] as const
                      }
                    />
                  </div>
                </section>

                <div className="discussion-hub__thread-list" aria-live="polite">
                  {isWorkspacePending ? (
                    <div className="discussion-hub__empty" aria-busy="true">
                      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
                      <h2>Loading discussions…</h2>
                    </div>
                  ) : isWorkspaceError ? (
                    <div className="discussion-hub__empty" role="alert">
                      <h2>Unable to load discussions</h2>
                      <p>
                        {workspaceError instanceof Error
                          ? workspaceError.message
                          : "There was a problem loading discussions."}
                      </p>
                      <button type="button" onClick={() => void refetch()}>
                        Retry
                      </button>
                    </div>
                  ) : cards.length > 0 ? (
                    cards.map((thread) => {
                      const StatusIcon = statusIcons[thread.status];
                      return activeTab === "q-and-a" ? (
                        <DiscussionWorkspaceQuestionCard
                          key={thread.id}
                          thread={thread}
                          setNotice={setNotice}
                        />
                      ) : (
                        <article className="discussion-thread" key={thread.id}>
                          <button
                            type="button"
                            className="discussion-thread__open"
                            onClick={() => openThread(thread)}
                          >
                            <div className="discussion-thread__avatar">
                              <DiscussionAvatar
                                src={thread.avatar || null}
                                className="discussion-thread__avatar-image"
                              />
                              {thread.status !== "open" && (
                                <i aria-hidden="true" />
                              )}
                            </div>
                            <div className="discussion-thread__body">
                              <span className="discussion-thread__title">
                                {thread.title}
                              </span>
                              <p>{thread.excerpt}</p>
                              {(thread.course || thread.lesson) && (
                                <div className="discussion-thread__context">
                                  {thread.course && <span>{thread.course}</span>}
                                  {thread.course && thread.lesson && (
                                    <span aria-hidden="true" />
                                  )}
                                  {thread.lesson && <small>{thread.lesson}</small>}
                                </div>
                              )}
                            </div>
                            <div className="discussion-thread__meta">
                              <span
                                className={`discussion-thread__status is-${thread.status}`}
                              >
                                <StatusIcon size={15} weight="fill" />{" "}
                                {statusLabels[thread.status]}
                              </span>
                              <span>
                                <ChatTeardropText size={17} /> {thread.replies}{" "}
                                {thread.replies === 1 ? "reply" : "replies"}
                              </span>
                              <time>{thread.activity}</time>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="discussion-thread__more"
                            aria-label={`More options for ${thread.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setNotice?.(
                                "Thread actions will be available with connected discussions.",
                              );
                            }}
                          >
                            <DotsThreeVertical size={21} weight="bold" />
                          </button>
                        </article>
                      );
                    })
                  ) : (
                    <div className="discussion-hub__empty">
                      <UsersThree size={30} weight="duotone" />
                      <h2>No discussions match these filters</h2>
                      <p>
                        Try clearing a filter or start a new question for the
                        course.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setCourse("all");
                          setStatus("all");
                          setSort("activity");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <div ref={loadMoreRef} aria-live="polite">
                    {isFetchingNextPage && (
                      <p className="py-3 text-center text-xs font-medium text-(--muted)">
                        Loading more discussions…
                      </p>
                    )}
                    {isFetchNextPageError && (
                      <div className="flex justify-center py-3">
                        <button type="button" onClick={loadMore}>
                          Retry loading more
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </main>

            </div>
          </>
        )}
      </SwipeableTabPanel>
    </div>
  );
}
