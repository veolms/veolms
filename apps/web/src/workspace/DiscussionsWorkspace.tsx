import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/Funnel";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
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
import { ThemedSelect } from "../ThemedSelect";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";

type DiscussionStatus = "answered" | "mentioned" | "solved" | "open";

interface DiscussionThread {
  id: string;
  title: string;
  excerpt: string;
  course: string;
  lesson: string;
  avatar: string;
  status: DiscussionStatus;
  replies: number;
  activity: string;
  tabs: DiscussionTab[];
}

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

const initialThreads: readonly DiscussionThread[] = [
  {
    id: "explicit-return-types",
    title: "Why does TypeScript require explicit return types in some cases?",
    excerpt:
      "I'm a bit confused about when and why we need to define explicit return types for functions. Could someone explain with an example?",
    course: "The Ultimate TypeScript Course",
    lesson: "Lecture 84: Conditional Types",
    avatar: "/assets/ethan-avatar-160.webp",
    status: "answered",
    replies: 12,
    activity: "18 min ago",
    tabs: ["q-and-a", "following"],
  },
  {
    id: "mapped-type-modifiers",
    title: "Understanding mapped types with modifiers",
    excerpt:
      "Can someone help me understand how 'readonly' and 'optional' modifiers work together in mapped types?",
    course: "The Ultimate TypeScript Course",
    lesson: "Lecture 85: Mapped Types Deep Dive",
    avatar: "/assets/sofia-avatar-160.webp",
    status: "mentioned",
    replies: 8,
    activity: "2h ago",
    tabs: ["q-and-a", "mentions", "saved"],
  },
  {
    id: "large-typescript-projects",
    title: "Best practices for organizing large TypeScript projects",
    excerpt:
      "What folder structure and patterns do you follow for large-scale TypeScript applications?",
    course: "Complete Backend with Node.js",
    lesson: "Section 14: Performance & Optimization",
    avatar: "/assets/ethan-avatar-160.webp",
    status: "solved",
    replies: 24,
    activity: "5h ago",
    tabs: ["q-and-a", "following"],
  },
  {
    id: "interface-or-type-alias",
    title: "Difference between interface and Type alias?",
    excerpt:
      "I know both can be used to define shapes, but when should we prefer one over the other?",
    course: "The Ultimate TypeScript Course",
    lesson: "Lecture 86: Template Literal Types",
    avatar: "/assets/sofia-avatar-160.webp",
    status: "open",
    replies: 15,
    activity: "1d ago",
    tabs: ["q-and-a", "saved"],
  },
  {
    id: "mysql-joins",
    title: "Help with MySQL joins in real-world scenarios",
    excerpt:
      "Could you share some practical examples of when to use INNER, LEFT, and RIGHT joins?",
    course: "Complete SQL Mastery",
    lesson: "Lecture 21: Joins and Relationships",
    avatar: "/assets/ethan-avatar-160.webp",
    status: "open",
    replies: 6,
    activity: "2d ago",
    tabs: ["q-and-a", "comments"],
  },
];

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

export function DiscussionsWorkspace({
  role,
  tab = "q-and-a",
  onNavigatePage,
  setNotice,
}: DiscussionsWorkspaceProps) {
  const activeTab = normalizeDiscussionTab(tab);
  const navigateTab = (id: DiscussionTab) => {
    rememberDiscussionTab(id);
    onNavigatePage(`/discussions/${id}`, { preserveScroll: true });
  };
  const tablistRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("activity");
  const [composer, setComposer] = useState<"question" | "discussion" | null>(
    null,
  );
  const [threads, setThreads] =
    useState<readonly DiscussionThread[]>(initialThreads);

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

  const getVisibleThreads = (panelTab: DiscussionTab) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matching = threads.filter((thread) => {
      const matchesTab =
        panelTab === "q-and-a" || thread.tabs.includes(panelTab);
      const matchesQuery =
        !normalizedQuery ||
        `${thread.title} ${thread.excerpt} ${thread.course}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCourse = course === "all" || thread.course === course;
      const matchesStatus = status === "all" || thread.status === status;
      return matchesTab && matchesQuery && matchesCourse && matchesStatus;
    });
    return sort === "replies"
      ? [...matching].sort((left, right) => right.replies - left.replies)
      : matching;
  };

  const publish = (
    kind: "question" | "discussion",
    title: string,
    excerpt: string,
  ) => {
    const destinationTab: DiscussionTab =
      kind === "question" ? "q-and-a" : "comments";

    setThreads((current) => [
      {
        id: `thread-${Date.now()}`,
        title,
        excerpt,
        course:
          role === "creator"
            ? "Creator community"
            : "The Ultimate TypeScript Course",
        lesson: "General discussion",
        avatar: "/assets/sofia-avatar-160.webp",
        status: "open",
        replies: 0,
        activity: "Just now",
        tabs: [destinationTab, "following"],
      },
      ...current,
    ]);
    setComposer(null);
    navigateTab(destinationTab);
    setNotice?.(
      `Your ${kind === "question" ? "question" : "discussion"} has been published.`,
    );
  };

  const openThread = (thread: DiscussionThread) => {
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
        {(panelTab, preview) => (
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
                      value={course}
                      onValueChange={setCourse}
                      ariaLabel="Filter discussions by course"
                      triggerClassName="discussion-hub__select-trigger"
                      contentClassName="discussion-hub__select-content"
                      options={
                        [
                          ["all", "Course"],
                          ["The Ultimate TypeScript Course", "TypeScript"],
                          [
                            "Complete Backend with Node.js",
                            "Backend with Node.js",
                          ],
                          ["Complete SQL Mastery", "SQL Mastery"],
                        ] as const
                      }
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
                  {getVisibleThreads(panelTab).map((thread) => {
                    const StatusIcon = statusIcons[thread.status];
                    return (
                      <article className="discussion-thread" key={thread.id}>
                        <button
                          type="button"
                          className="discussion-thread__open"
                          onClick={() => openThread(thread)}
                        >
                          <div className="discussion-thread__avatar">
                            <img src={thread.avatar} alt="" />
                            {thread.status !== "open" && (
                              <i aria-hidden="true" />
                            )}
                          </div>
                          <div className="discussion-thread__body">
                            <span className="discussion-thread__title">
                              {thread.title}
                            </span>
                            <p>{thread.excerpt}</p>
                            <div className="discussion-thread__context">
                              <span>{thread.course}</span>
                              <span aria-hidden="true" />
                              <small>{thread.lesson}</small>
                            </div>
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
                  })}
                  {getVisibleThreads(panelTab).length === 0 && (
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
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              </main>

              <aside
                className="discussion-hub__side"
                aria-label="Discussion activity"
              >
                <section className="discussion-side-card discussion-side-card--activity">
                  <header>
                    <h2>My Activity</h2>
                    <button
                      type="button"
                      aria-label="Open activity details"
                      onClick={() =>
                        setNotice?.(
                          "Activity details will open here when discussions are connected.",
                        )
                      }
                    >
                      <ArrowSquareOut size={18} />
                    </button>
                  </header>
                  <dl>
                    <div>
                      <dt>
                        <Question size={17} weight="fill" /> Questions asked
                      </dt>
                      <dd>8</dd>
                    </div>
                    <div>
                      <dt>
                        <ChatTeardropText size={17} weight="fill" /> Replies
                      </dt>
                      <dd>23</dd>
                    </div>
                    <div>
                      <dt>
                        <CheckCircle size={17} weight="fill" /> Answers accepted
                      </dt>
                      <dd>3</dd>
                    </div>
                    <div>
                      <dt>
                        <Bell size={17} weight="fill" /> Helpful votes
                      </dt>
                      <dd>17</dd>
                    </div>
                  </dl>
                </section>

                <section className="discussion-side-card discussion-side-card--mentions">
                  <header>
                    <h2>Unread Mentions</h2>
                    <button
                      type="button"
                      onClick={() => navigateTab("mentions")}
                    >
                      View all
                    </button>
                  </header>
                  <div className="discussion-mention">
                    <img src="/assets/sofia-avatar-160.webp" alt="" />
                    <p>
                      <strong>Anurag Singh mentioned you</strong>
                      <span>
                        in “Understanding mapped types with modifiers”
                      </span>
                    </p>
                    <time>18 min ago</time>
                  </div>
                  <div className="discussion-mention">
                    <img src="/assets/ethan-avatar-160.webp" alt="" />
                    <p>
                      <strong>Instructor mentioned you</strong>
                      <span>
                        in “Why does TypeScript require explicit return types”
                      </span>
                    </p>
                    <time>2h ago</time>
                  </div>
                </section>

                <section className="discussion-side-card discussion-side-card--actions">
                  <h2>Quick Actions</h2>
                  <button type="button" onClick={() => setComposer("question")}>
                    <span>
                      <Question size={19} weight="duotone" />
                    </span>
                    <div>
                      <strong>Ask a Question</strong>
                      <small>Get help from instructors and peers</small>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposer("discussion")}
                  >
                    <span>
                      <ChatCircleDots size={19} weight="duotone" />
                    </span>
                    <div>
                      <strong>Start a Discussion</strong>
                      <small>Share ideas and start a conversation</small>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigatePage("/courses")}
                  >
                    <span>
                      <BookmarkSimple size={19} weight="duotone" />
                    </span>
                    <div>
                      <strong>Browse Guidelines</strong>
                      <small>Review course spaces and learning resources</small>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                </section>
              </aside>
            </div>
          </>
        )}
      </SwipeableTabPanel>
    </div>
  );
}
