import {
  Fragment,
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import type { ReactElement, ReactNode } from "react";
import { useSearchParams } from "react-router";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/Funnel";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { NoteIcon as Note } from "@phosphor-icons/react/Note";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import type { CourseRole } from "../courses/catalogue";
import { formatRelativeDate } from "../settings/sessionDisplay";
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
import { useDiscussionsWorkspace } from "../services/learning-interactions";
import { ThemedSelect } from "../ThemedSelect";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import { DiscussionAvatar } from "../learning/DiscussionAvatar";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import type { DiscussionContent } from "../learning/discussion-editor/types";
import { getCoursePlayerPath } from "../learning/coursePlayerNavigation";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import {
  adaptDiscussionWorkspaceItem,
  type DiscussionWorkspaceCard,
} from "./discussions-workspace.adapter";

type DiscussionStatus = NonNullable<DiscussionWorkspaceCard["status"]>;

type PageTabTone = "blue" | "green" | "gold" | "rose" | "violet";

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollVertically = /(?:auto|scroll|overlay)/.test(style.overflowY);

    if (canScrollVertically) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

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
  { id: "notes", label: "Notes", Icon: Note, tone: "gold" },
  { id: "mentions", label: "Mentions", Icon: At, tone: "rose" },
  {
    id: "following",
    label: "Following",
    Icon: ChatCircleDots,
    tone: "green",
  },
  { id: "saved", label: "Bookmarks", Icon: BookmarkSimple, tone: "gold" },
];

const discussionTabIds = tabs.map(({ id }) => id);

const statusLabels: Readonly<Record<DiscussionStatus, string>> = {
  answered: "Instructor answered",
  mentioned: "Mentioned you",
  solved: "Solved",
  open: "Open",
};

const qnaStatusLabels = {
  open: "Open",
  answered: "Answered",
  solved: "Solved",
} as const;

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

function getDiscussionThreadDestination(
  thread: DiscussionWorkspaceCard,
  returnPath = "/discussions/q-and-a",
): string {
  const basePath = getCoursePlayerPath(
    thread.courseId,
    "courses",
    1,
    returnPath,
    { threadId: thread.id },
  );
  if (!thread.lessonId) return basePath;

  const [pathname, query = ""] = basePath.split("?", 2);
  const search = new URLSearchParams(query);
  search.set("lessonId", thread.lessonId);
  return `${pathname}?${search.toString()}`;
}

function DiscussionWorkspaceAttachmentIndicator({ label }: { label: string }) {
  return (
    <span className="discussion-thread__attachment inline-flex items-center gap-1.5 text-xs text-(--muted)">
      <Paperclip size={15} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

type DiscussionWorkspaceMetadataItem = {
  key: string;
  content: ReactNode;
};

function getDiscussionWorkspaceMetadataItems(
  thread: DiscussionWorkspaceCard,
  options?: { timestampLabel?: string | null },
): DiscussionWorkspaceMetadataItem[] {
  const items: DiscussionWorkspaceMetadataItem[] = [];
  const attachmentLabel = getAttachmentLabel(thread.attachmentSummary);
  const visibilityLabel = getVisibilityLabel(thread.visibility);
  const VisibilityIcon =
    thread.visibility === "private"
      ? Lock
      : thread.visibility === "unlisted"
        ? EyeSlash
        : Globe;

  if (thread.course) {
    items.push({ key: "course", content: <span>{thread.course}</span> });
  }
  if (thread.lesson) {
    items.push({
      key: "lesson",
      content: (
        <small className="discussion-thread__lesson">
          <BookOpen size={13} aria-hidden="true" />
          <span>{thread.lesson}</span>
        </small>
      ),
    });
  }
  if (options?.timestampLabel) {
    items.push({
      key: "timestamp",
      content: (
        <small className="discussion-thread__timestamp">
          <Clock size={13} aria-hidden="true" />
          <span>{options.timestampLabel}</span>
        </small>
      ),
    });
  }
  if (attachmentLabel) {
    items.push({
      key: "attachments",
      content: (
        <DiscussionWorkspaceAttachmentIndicator label={attachmentLabel} />
      ),
    });
  }
  if (visibilityLabel) {
    items.push({
      key: "visibility",
      content: (
        <small className="discussion-thread__visibility">
          <VisibilityIcon size={13} aria-hidden="true" />
          <span>{visibilityLabel}</span>
        </small>
      ),
    });
  }

  return items;
}

function DiscussionWorkspaceMetadataRow({
  items,
}: {
  items: readonly DiscussionWorkspaceMetadataItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="discussion-thread__context">
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <span aria-hidden="true" />}
          {item.content}
        </Fragment>
      ))}
    </div>
  );
}

function normalizeWorkspacePreviewText(
  value: string | null | undefined,
): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function DiscussionWorkspaceCardContent({
  thread,
  label,
  expanded,
  onExpandedChange,
  expandedTitle,
  previewText,
  parentContext,
}: {
  thread: DiscussionWorkspaceCard;
  label: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  expandedTitle?: string | null;
  previewText?: string | null;
  parentContext?: string | null;
}) {
  const [isPreviewTruncated, setIsPreviewTruncated] = useState(false);
  const previewRef = useRef<HTMLSpanElement>(null);
  const normalizedTitle = normalizeWorkspacePreviewText(expandedTitle);
  const normalizedBody = normalizeWorkspacePreviewText(
    thread.plainText || thread.excerpt || thread.content,
  );
  const collapsedPreview =
    normalizeWorkspacePreviewText(previewText) ||
    normalizedTitle ||
    normalizedBody;
  const hasAdditionalContent =
    (Boolean(normalizedTitle) && normalizedTitle !== collapsedPreview) ||
    (Boolean(normalizedBody) && normalizedBody !== collapsedPreview);
  const canExpand = hasAdditionalContent || isPreviewTruncated;
  const content = useMemo<DiscussionContent>(
    () => ({
      format: "markdown",
      markdown: thread.content.trim() || thread.plainText,
      plainText: thread.plainText,
    }),
    [thread.content, thread.plainText],
  );

  useEffect(() => {
    if (expanded) return undefined;

    const node = previewRef.current;
    if (!node) return undefined;

    const measure = () => {
      const nextIsTruncated = node.scrollWidth > node.clientWidth + 1;
      setIsPreviewTruncated((current) =>
        current === nextIsTruncated ? current : nextIsTruncated,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [collapsedPreview, expanded]);

  const utility = (showExpandedLabel: boolean) =>
    (canExpand || parentContext) && (
      <span className="discussion-hub__card-content-utility">
        {parentContext && (
          <span className="discussion-thread__parent-context">
            <ChatTeardropText size={14} aria-hidden="true" />
            <span>{parentContext}</span>
          </span>
        )}
        {canExpand && parentContext && (
          <span
            className="discussion-hub__card-content-utility-separator"
            aria-hidden="true"
          >
            ·
          </span>
        )}
        {canExpand && (
          <button
            type="button"
            className="discussion-hub__card-content-toggle"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onExpandedChange(!expanded);
            }}
            aria-expanded={expanded}
          >
            {showExpandedLabel ? "Show less" : "Read more"}
          </button>
        )}
      </span>
    );

  return (
    <div className="discussion-hub__card-content">
      {expanded ? (
        <div className="discussion-hub__card-content-expanded">
          {normalizedTitle && (
            <div className="discussion-hub__card-content-title">
              {normalizedTitle}
            </div>
          )}
          <DiscussionMarkdown
            content={content}
            label={`${label} by ${thread.author}`}
            className="max-w-none"
          />
          {utility(true)}
        </div>
      ) : (
        <div className="discussion-hub__card-preview-row">
          <span ref={previewRef} className="discussion-hub__card-preview">
            {collapsedPreview}
          </span>
          {utility(false)}
        </div>
      )}
    </div>
  );
}

function DiscussionWorkspaceIdentity({
  thread,
}: {
  thread: DiscussionWorkspaceCard;
}) {
  return (
    <div className="discussion-thread__author">
      <span className="discussion-thread__author-name">
        {thread.isOwn ? "You" : thread.author}
      </span>
      {thread.authorUsername && (
        <>
          <span
            className="discussion-thread__author-separator"
            aria-hidden="true"
          >
            ·
          </span>
          <span className="discussion-thread__author-username">
            @{thread.authorUsername.replace(/^@+/, "")}
          </span>
        </>
      )}
    </div>
  );
}

function DiscussionWorkspaceNavigationLink({
  destination,
  label,
  onNavigatePage,
}: {
  destination: string;
  label: string;
  onNavigatePage: NavigateTo;
}) {
  return (
    <a
      className="discussion-thread__navigation-link"
      href={destination}
      aria-label={label}
      onClick={(event) => {
        if (
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
      }}
    />
  );
}

type DiscussionWorkspaceRailElement = ReactElement<{ className?: string }>;

function withDiscussionWorkspaceRailSlot(
  element: DiscussionWorkspaceRailElement,
  slot: "top" | "middle" | "bottom",
) {
  return cloneElement(element, {
    className: [
      element.props.className,
      `discussion-thread__rail-slot--${slot}`,
    ]
      .filter(Boolean)
      .join(" "),
  });
}

function DiscussionWorkspaceCardRail({
  top,
  middle,
  bottom,
}: {
  top: DiscussionWorkspaceRailElement;
  middle?: DiscussionWorkspaceRailElement;
  bottom: DiscussionWorkspaceRailElement;
}) {
  return (
    <>
      {withDiscussionWorkspaceRailSlot(top, "top")}
      {middle && withDiscussionWorkspaceRailSlot(middle, "middle")}
      {withDiscussionWorkspaceRailSlot(bottom, "bottom")}
    </>
  );
}

function DiscussionWorkspaceCardShell({
  thread,
  className,
  expanded,
  navigation,
  children,
  rail,
}: {
  thread: DiscussionWorkspaceCard;
  className: string;
  expanded: boolean;
  navigation?: ReactNode;
  children: ReactNode;
  rail: {
    top: DiscussionWorkspaceRailElement;
    middle?: DiscussionWorkspaceRailElement;
    bottom: DiscussionWorkspaceRailElement;
  };
}) {
  return (
    <article
      className={[
        "discussion-thread",
        "discussion-thread--workspace-card",
        className,
        navigation ? "is-navigable" : "is-static",
        expanded ? "is-expanded" : "is-collapsed",
      ].join(" ")}
    >
      {navigation}
      <div className="discussion-thread__open discussion-thread__open--overview">
        <div className="discussion-thread__avatar">
          <DiscussionAvatar
            src={thread.avatar || null}
            className="discussion-thread__avatar-image"
          />
        </div>
        <div className="discussion-thread__body">{children}</div>
        <div className="discussion-thread__meta">
          <DiscussionWorkspaceCardRail {...rail} />
        </div>
      </div>
    </article>
  );
}

function DiscussionWorkspaceQuestionCard({
  thread,
  onNavigatePage,
}: {
  thread: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadataItems = getDiscussionWorkspaceMetadataItems(thread);
  const lifecycleStatus: "open" | "answered" | "solved" =
    thread.status === "answered"
      ? "answered"
      : thread.status === "solved"
        ? "solved"
        : "open";
  const LifecycleIcon = statusIcons[lifecycleStatus];
  const destination = getDiscussionThreadDestination(thread);
  const destinationLabel = [thread.course, thread.lesson]
    .filter(Boolean)
    .join(", ");

  return (
    <DiscussionWorkspaceCardShell
      thread={thread}
      className="discussion-thread--question"
      expanded={expanded}
      navigation={
        <DiscussionWorkspaceNavigationLink
          destination={destination}
          label={`Open question${
            destinationLabel ? ` in ${destinationLabel}` : ""
          }`}
          onNavigatePage={onNavigatePage}
        />
      }
      rail={{
        top: (
          <span
            className={[
              "discussion-thread__status",
              `is-${lifecycleStatus}`,
              lifecycleStatus === "open" ? "" : "discussion-thread__rail-badge",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="discussion-thread__status-label">
              <LifecycleIcon size={15} weight="fill" aria-hidden="true" />
              <span>{qnaStatusLabels[lifecycleStatus]}</span>
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
        ),
        middle: (
          <span>
            <ChatTeardropText size={17} /> {thread.replies}{" "}
            {thread.replies === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: <time>{thread.activity}</time>,
      }}
    >
      <DiscussionWorkspaceIdentity thread={thread} />
      <DiscussionWorkspaceCardContent
        thread={thread}
        label="Question"
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandedTitle={thread.title}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceCommentCard({
  thread,
  onNavigatePage,
}: {
  thread: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadataItems = getDiscussionWorkspaceMetadataItems(thread);
  const destination = getDiscussionThreadDestination(
    thread,
    "/discussions/comments",
  );
  const destinationLabel = [thread.course, thread.lesson]
    .filter(Boolean)
    .join(", ");

  return (
    <DiscussionWorkspaceCardShell
      thread={thread}
      className="discussion-thread--comment"
      expanded={expanded}
      navigation={
        <DiscussionWorkspaceNavigationLink
          destination={destination}
          label={`Open comment${
            destinationLabel ? ` in ${destinationLabel}` : ""
          }`}
          onNavigatePage={onNavigatePage}
        />
      }
      rail={{
        top: (
          <span className="discussion-thread__engagement discussion-thread__rail-badge discussion-thread__likes-badge">
            <ThumbsUp size={15} weight="fill" aria-hidden="true" />
            <span>
              {thread.likes} {thread.likes === 1 ? "like" : "likes"}
            </span>
          </span>
        ),
        middle: (
          <span>
            <ChatTeardropText size={17} /> {thread.replies}{" "}
            {thread.replies === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: <time>{thread.activity}</time>,
      }}
    >
      <DiscussionWorkspaceIdentity thread={thread} />
      <DiscussionWorkspaceCardContent
        thread={thread}
        label="Comment"
        expanded={expanded}
        onExpandedChange={setExpanded}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceFollowingCard({
  thread,
  onNavigatePage,
}: {
  thread: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
}) {
  const [expanded, setExpanded] = useState(false);
  const isQuestion = thread.kind === "question" || thread.kind === "qna";
  const metadataItems = getDiscussionWorkspaceMetadataItems(thread);
  const destination = getDiscussionThreadDestination(
    thread,
    "/discussions/following",
  );
  const destinationLabel = [thread.course, thread.lesson]
    .filter(Boolean)
    .join(", ");

  return (
    <DiscussionWorkspaceCardShell
      thread={thread}
      className="discussion-thread--following"
      expanded={expanded}
      navigation={
        <DiscussionWorkspaceNavigationLink
          destination={destination}
          label={`Open followed ${isQuestion ? "question" : "comment"}${
            destinationLabel ? ` in ${destinationLabel}` : ""
          }`}
          onNavigatePage={onNavigatePage}
        />
      }
      rail={{
        top: (
          <span
            className={[
              "discussion-thread__following-indicator",
              "discussion-thread__rail-badge",
              isQuestion ? "is-qna" : "is-comment",
            ].join(" ")}
          >
            {isQuestion ? (
              <Question size={15} weight="fill" aria-hidden="true" />
            ) : (
              <ChatTeardropText size={15} weight="fill" aria-hidden="true" />
            )}
            <span>{isQuestion ? "Q&A" : "Comment"}</span>
          </span>
        ),
        middle: (
          <span>
            <ChatTeardropText size={17} /> {thread.replies}{" "}
            {thread.replies === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: <time dateTime={thread.updatedAt}>{thread.activity}</time>,
      }}
    >
      <DiscussionWorkspaceIdentity thread={thread} />
      <DiscussionWorkspaceCardContent
        thread={thread}
        label={isQuestion ? "Question" : "Comment"}
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandedTitle={isQuestion ? thread.title : undefined}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceMentionCard({
  mention,
  onNavigatePage,
}: {
  mention: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
}) {
  const [expanded, setExpanded] = useState(false);
  const isReply = mention.itemType === "reply";
  const isRootQuestion =
    !isReply && (mention.kind === "question" || mention.kind === "qna");
  const metadataItems = getDiscussionWorkspaceMetadataItems(mention);
  const isQuestionMention =
    mention.kind === "question" || mention.kind === "qna";
  const parentKindLabel = isQuestionMention ? "Q&A" : "Comment";
  const MentionSourceIcon = isQuestionMention ? Question : ChatTeardropText;
  const mentionTypeLabel = isReply
    ? parentKindLabel + " Reply"
    : parentKindLabel;
  const parentContext = isReply
    ? mention.parentThreadTitle?.trim()
      ? `Reply in ${mention.parentThreadTitle.trim()} · ${parentKindLabel}`
      : `Reply in ${parentKindLabel}`
    : null;
  const destination = getDiscussionThreadDestination(
    isReply && mention.parentThreadId
      ? { ...mention, id: mention.parentThreadId }
      : mention,
    "/discussions/mentions",
  );
  const destinationLabel = [mention.course, mention.lesson]
    .filter(Boolean)
    .join(", ");
  const mentionActivity = mention.mentionActivity ?? "Recently";

  return (
    <DiscussionWorkspaceCardShell
      thread={mention}
      className="discussion-thread--mention"
      expanded={expanded}
      navigation={
        <DiscussionWorkspaceNavigationLink
          destination={destination}
          label={`${
            isReply ? "Open parent discussion" : "Open mentioned discussion"
          }${destinationLabel ? ` in ${destinationLabel}` : ""}`}
          onNavigatePage={onNavigatePage}
        />
      }
      rail={{
        top: (
          <span
            className={[
              "discussion-thread__mention-indicator",
              "discussion-thread__rail-badge",
              isQuestionMention ? "is-qna" : "is-comment",
            ].join(" ")}
          >
            <MentionSourceIcon size={15} weight="fill" aria-hidden="true" />
            <span>{mentionTypeLabel}</span>
          </span>
        ),
        middle: (
          <span>
            <ChatTeardropText size={17} /> {mention.replies}{" "}
            {mention.replies === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: <time dateTime={mention.mentionedAt}>{mentionActivity}</time>,
      }}
    >
      <DiscussionWorkspaceIdentity thread={mention} />
      <DiscussionWorkspaceCardContent
        thread={mention}
        label="Mention"
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandedTitle={isRootQuestion ? mention.title : undefined}
        previewText={mention.plainText}
        parentContext={parentContext}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function formatNoteTimestamp(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function DiscussionWorkspaceNoteCard({
  note,
}: {
  note: DiscussionWorkspaceCard;
}) {
  const [expanded, setExpanded] = useState(false);
  const timestampLabel = formatNoteTimestamp(note.timestampSeconds);
  const metadataItems = getDiscussionWorkspaceMetadataItems(note, {
    timestampLabel,
  });

  return (
    <DiscussionWorkspaceCardShell
      thread={note}
      className="discussion-thread--note"
      expanded={expanded}
      rail={{
        top: (
          <span className="discussion-thread__engagement discussion-thread__rail-badge discussion-thread__likes-badge">
            <ThumbsUp size={15} weight="fill" aria-hidden="true" />
            <span>
              {note.likes} {note.likes === 1 ? "like" : "likes"}
            </span>
          </span>
        ),
        bottom: (
          <time dateTime={note.updatedAt || note.createdAt}>
            {note.activity}
          </time>
        ),
      }}
    >
      <DiscussionWorkspaceIdentity thread={note} />
      <DiscussionWorkspaceCardContent
        thread={note}
        label="Note"
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandedTitle={note.title}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceBookmarkCard({
  bookmark,
  onNavigatePage,
}: {
  bookmark: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNote = bookmark.itemType === "note" || bookmark.kind === "note";
  const isQuestion =
    !isNote && (bookmark.kind === "question" || bookmark.kind === "qna");
  const sourceLabel = isNote ? "Note" : isQuestion ? "Q&A" : "Comment";
  const SourceIcon = isNote ? Note : isQuestion ? Question : ChatTeardropText;
  const metadataItems = getDiscussionWorkspaceMetadataItems(bookmark);
  const destination = isNote
    ? null
    : getDiscussionThreadDestination(bookmark, "/discussions/saved");
  const destinationLabel = [bookmark.course, bookmark.lesson]
    .filter(Boolean)
    .join(", ");

  return (
    <DiscussionWorkspaceCardShell
      thread={bookmark}
      className={`discussion-thread--bookmark discussion-thread--bookmark-${
        isNote ? "note" : isQuestion ? "question" : "comment"
      }`}
      expanded={expanded}
      navigation={
        destination ? (
          <DiscussionWorkspaceNavigationLink
            destination={destination}
            label={
              "Open bookmarked " +
              sourceLabel.toLowerCase() +
              (destinationLabel ? " in " + destinationLabel : "")
            }
            onNavigatePage={onNavigatePage}
          />
        ) : undefined
      }
      rail={{
        top: (
          <span
            className={[
              "discussion-thread__bookmark-source",
              "discussion-thread__rail-badge",
              isNote ? "is-note" : isQuestion ? "is-qna" : "is-comment",
            ].join(" ")}
          >
            <SourceIcon size={15} weight="fill" aria-hidden="true" />
            <span>{sourceLabel}</span>
          </span>
        ),
        middle: isNote ? undefined : (
          <span>
            <ChatTeardropText size={17} aria-hidden="true" /> {bookmark.replies}{" "}
            {bookmark.replies === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: (
          <time dateTime={bookmark.bookmarkedAt}>
            Saved · {formatRelativeDate(bookmark.bookmarkedAt)}
          </time>
        ),
      }}
    >
      <DiscussionWorkspaceIdentity thread={bookmark} />
      <DiscussionWorkspaceCardContent
        thread={bookmark}
        label={`Bookmarked ${sourceLabel}`}
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandedTitle={isQuestion || isNote ? bookmark.title : undefined}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
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
  const [qnaStatus, setQnaStatus] = useState("all");
  const [qnaSort, setQnaSort] = useState("activity");
  const [notesSort, setNotesSort] = useState<"activity" | "latest">("activity");
  const [composer, setComposer] = useState<"question" | "discussion" | null>(
    null,
  );

  const isQnaTab = activeTab === "q-and-a";
  const isCommentsTab = activeTab === "comments";
  const isNotesTab = activeTab === "notes";
  const isMentionsTab = activeTab === "mentions";
  const isFollowingTab = activeTab === "following";
  const isBookmarksTab = activeTab === "saved";
  const workspaceStatus = isQnaTab ? qnaStatus : status;
  const workspaceSort = isQnaTab ? qnaSort : sort;

  const workspaceQuery = (() => {
    const sharedQuery = {
      tab: activeTab,
      ...(selectedCourseId !== "all" ? { courseId: selectedCourseId } : {}),
      ...(debouncedQuery.trim() ? { search: debouncedQuery.trim() } : {}),
      limit: 20,
    };

    if (isNotesTab) {
      return {
        ...sharedQuery,
        mine: true,
        sort: notesSort,
      };
    }

    if (isFollowingTab) {
      return {
        ...sharedQuery,
        sort: "activity" as const,
      };
    }

    if (isBookmarksTab) return sharedQuery;

    if (isMentionsTab) return sharedQuery;

    return {
      ...sharedQuery,
      ...(isQnaTab || isCommentsTab ? { mine: true } : {}),
      ...(isCommentsTab
        ? {}
        : {
            status: workspaceStatus as
              "all" | "answered" | "mentioned" | "solved" | "open",
          }),
      sort: workspaceSort as "activity" | "latest" | "replies",
    };
  })();
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
        .map((item) =>
          adaptDiscussionWorkspaceItem(item, {
            comments: isCommentsTab,
            mentions: isMentionsTab,
            notes: isNotesTab,
            following: isFollowingTab,
            bookmarks: isBookmarksTab,
          }),
        ) ?? [],
    [
      isBookmarksTab,
      isCommentsTab,
      isFollowingTab,
      isMentionsTab,
      isNotesTab,
      workspaceData,
    ],
  );

  const [knownCourseOptions, setKnownCourseOptions] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const incomingCourses = workspaceData?.pages.flatMap(
      (page) => page.courses,
    );
    if (!incomingCourses?.length) return;

    setKnownCourseOptions((current) => {
      const next = { ...current };
      let changed = false;
      for (const course of incomingCourses) {
        if (next[course.id] === course.title) continue;
        next[course.id] = course.title;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [workspaceData]);

  const courses = new Map(Object.entries(knownCourseOptions));
  workspaceData?.pages.forEach((page) => {
    page.courses.forEach((courseOption) => {
      courses.set(courseOption.id, courseOption.title);
    });
  });
  if (selectedCourseId !== "all" && !courses.has(selectedCourseId)) {
    courses.set(selectedCourseId, "Selected course");
  }
  const courseOptions = [
    ["all", "All courses"] as const,
    ...Array.from(courses, ([id, title]) => [id, title] as const),
  ];

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
    if (!hasNextPage || isFetchingNextPage || fetchingNextPageRef.current) {
      return;
    }
    fetchingNextPageRef.current = true;
    void fetchNextPage().finally(() => {
      fetchingNextPageRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    fetchingNextPageRef.current = false;
  }, [
    activeTab,
    debouncedQuery,
    isCommentsTab,
    isFollowingTab,
    isBookmarksTab,
    isNotesTab,
    isQnaTab,
    notesSort,
    selectedCourseId,
    workspaceSort,
    workspaceStatus,
  ]);

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

    const scrollRoot = findScrollableAncestor(sentinel);
    const rootBottom = () =>
      scrollRoot?.getBoundingClientRect().bottom ?? window.innerHeight;

    const checkSentinel = () => {
      if (sentinel.getBoundingClientRect().top <= rootBottom() + 600) {
        loadMore();
      }
    };
    const scrollTargets: Array<HTMLElement | Window> = scrollRoot
      ? [scrollRoot, window]
      : [window];

    scrollTargets.forEach((target) => {
      target.addEventListener("scroll", checkSentinel, { passive: true });
    });
    checkSentinel();
    const layoutCheckFrame = window.requestAnimationFrame(checkSentinel);

    if (typeof IntersectionObserver === "undefined") {
      return () => {
        window.cancelAnimationFrame(layoutCheckFrame);
        scrollTargets.forEach((target) => {
          target.removeEventListener("scroll", checkSentinel);
        });
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) checkSentinel();
      },
      {
        root: scrollRoot,
        rootMargin: "600px 0px",
      },
    );
    observer.observe(sentinel);
    return () => {
      window.cancelAnimationFrame(layoutCheckFrame);
      observer.disconnect();
      scrollTargets.forEach((target) => {
        target.removeEventListener("scroll", checkSentinel);
      });
    };
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
    setNotice?.("Publishing is not connected in this phase.");
  };

  const openThread = (thread: DiscussionWorkspaceCard) => {
    setNotice?.(`Opened “${thread.title ?? "discussion"}”.`);
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
            {composer && !preview && isQnaTab && (
              <DiscussionComposer
                kind={composer}
                onCancel={() => setComposer(null)}
                onPublish={publish}
              />
            )}

            <div className="discussion-hub__layout">
              <main className="discussion-hub__feed">
                <section
                  className={`discussion-hub__filters ${
                    isFollowingTab
                      ? "discussion-hub__filters--following"
                      : isBookmarksTab
                        ? "discussion-hub__filters--bookmarks"
                        : isMentionsTab
                          ? "discussion-hub__filters--mentions"
                          : isCommentsTab || isNotesTab
                            ? "discussion-hub__filters--comments"
                            : ""
                  }`}
                  aria-label="Filter discussions"
                >
                  <label className="discussion-hub__search">
                    <MagnifyingGlass size={19} aria-hidden="true" />
                    <span className="sr-only">Search discussions</span>
                    <input
                      id="workspace-discussions-search-input"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={
                        isQnaTab
                          ? "Search your questions..."
                          : isCommentsTab
                            ? "Search your comments..."
                            : isNotesTab
                              ? "Search your notes..."
                              : isMentionsTab
                                ? "Search mentions..."
                                : isFollowingTab
                                  ? "Search followed discussions..."
                                  : isBookmarksTab
                                    ? "Search bookmarks"
                                    : "Search discussions by title or keyword..."
                      }
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
                      matchMenuToContainer={
                        isQnaTab ||
                        isCommentsTab ||
                        isNotesTab ||
                        isMentionsTab ||
                        isFollowingTab ||
                        isBookmarksTab
                      }
                      value={selectedCourseId}
                      options={courseOptions}
                    />
                  </div>
                  {!isCommentsTab &&
                    !isNotesTab &&
                    !isMentionsTab &&
                    !isFollowingTab &&
                    !isBookmarksTab && (
                      <div className="discussion-hub__select">
                        <ThemedSelect
                          value={isQnaTab ? qnaStatus : status}
                          onValueChange={isQnaTab ? setQnaStatus : setStatus}
                          ariaLabel="Filter discussions by status"
                          triggerClassName="discussion-hub__select-trigger"
                          contentClassName="discussion-hub__select-content"
                          matchMenuToContainer={isQnaTab}
                          options={
                            isQnaTab
                              ? ([
                                  ["all", "All"],
                                  ["open", "Open"],
                                  ["answered", "Answered"],
                                  ["solved", "Solved"],
                                  ["mentioned", "Mentioned"],
                                ] as const)
                              : ([
                                  ["all", "Status"],
                                  ["answered", "Answered"],
                                  ["mentioned", "Mentioned"],
                                  ["solved", "Solved"],
                                  ["open", "Open"],
                                ] as const)
                          }
                        />
                      </div>
                    )}
                  {isMentionsTab ||
                  isFollowingTab ||
                  isBookmarksTab ? null : isNotesTab ? (
                    <div className="discussion-hub__select discussion-hub__select--sort">
                      <Funnel size={17} aria-hidden="true" />
                      <ThemedSelect<"activity" | "latest">
                        value={notesSort}
                        onValueChange={setNotesSort}
                        ariaLabel={`Sort notes: ${
                          notesSort === "activity"
                            ? "Latest activity"
                            : "Newest"
                        }`}
                        triggerClassName="discussion-hub__select-trigger"
                        contentClassName="discussion-hub__select-content"
                        matchMenuToContainer
                        options={[
                          ["activity", "Latest activity"],
                          ["latest", "Newest"],
                        ]}
                      />
                    </div>
                  ) : (
                    <div className="discussion-hub__select discussion-hub__select--sort">
                      <Funnel size={17} aria-hidden="true" />
                      <ThemedSelect
                        value={isQnaTab ? qnaSort : sort}
                        onValueChange={isQnaTab ? setQnaSort : setSort}
                        ariaLabel={
                          isQnaTab
                            ? `Sort questions: ${
                                qnaSort === "activity"
                                  ? "Latest activity"
                                  : qnaSort === "latest"
                                    ? "Newest"
                                    : "Most replies"
                              }`
                            : `${isCommentsTab ? "Sort comments" : "Sort discussions"}: ${
                                sort === "activity"
                                  ? "Latest activity"
                                  : sort === "replies"
                                    ? "Most replies"
                                    : "Newest"
                              }`
                        }
                        triggerClassName="discussion-hub__select-trigger"
                        contentClassName="discussion-hub__select-content"
                        matchMenuToContainer={isQnaTab || isCommentsTab}
                        options={
                          isQnaTab
                            ? ([
                                ["activity", "Latest activity"],
                                ["latest", "Newest"],
                                ["replies", "Most replies"],
                              ] as const)
                            : ([
                                ["activity", "Latest activity"],
                                ["replies", "Most replies"],
                              ] as const)
                        }
                      />
                    </div>
                  )}
                </section>

                <div className="discussion-hub__thread-list" aria-live="polite">
                  {isWorkspacePending ? (
                    <div className="discussion-hub__empty" aria-busy="true">
                      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
                      <h2>
                        {isNotesTab
                          ? "Loading notes…"
                          : isCommentsTab
                            ? "Loading comments…"
                            : isMentionsTab
                              ? "Loading mentions…"
                              : isFollowingTab
                                ? "Loading followed discussions…"
                                : isBookmarksTab
                                  ? "Loading bookmarks…"
                                  : "Loading discussions…"}
                      </h2>
                    </div>
                  ) : isWorkspaceError ? (
                    <div className="discussion-hub__empty" role="alert">
                      <h2>
                        {isNotesTab
                          ? "Unable to load notes"
                          : isCommentsTab
                            ? "Unable to load comments"
                            : isMentionsTab
                              ? "Unable to load mentions"
                              : isFollowingTab
                                ? "Failed to load followed discussions"
                                : isBookmarksTab
                                  ? "Unable to load bookmarks"
                                  : "Unable to load discussions"}
                      </h2>
                      <p>
                        {workspaceError instanceof Error
                          ? workspaceError.message
                          : isNotesTab
                            ? "There was a problem loading notes."
                            : isCommentsTab
                              ? "There was a problem loading comments."
                              : isMentionsTab
                                ? "There was a problem loading mentions."
                                : isFollowingTab
                                  ? "There was a problem loading followed discussions."
                                  : isBookmarksTab
                                    ? "There was a problem loading bookmarks."
                                    : "There was a problem loading discussions."}
                      </p>
                      <button type="button" onClick={() => void refetch()}>
                        Retry
                      </button>
                    </div>
                  ) : cards.length > 0 ? (
                    cards.map((thread) => {
                      if (isBookmarksTab) {
                        return (
                          <DiscussionWorkspaceBookmarkCard
                            key={thread.id}
                            bookmark={thread}
                            onNavigatePage={onNavigatePage}
                          />
                        );
                      }

                      if (isNotesTab) {
                        return (
                          <DiscussionWorkspaceNoteCard
                            key={thread.id}
                            note={thread}
                          />
                        );
                      }

                      if (isMentionsTab) {
                        return (
                          <DiscussionWorkspaceMentionCard
                            key={thread.id}
                            mention={thread}
                            onNavigatePage={onNavigatePage}
                          />
                        );
                      }

                      if (isFollowingTab) {
                        return (
                          <DiscussionWorkspaceFollowingCard
                            key={thread.id}
                            thread={thread}
                            onNavigatePage={onNavigatePage}
                          />
                        );
                      }

                      const discussionStatus = thread.status ?? "open";
                      const StatusIcon = statusIcons[discussionStatus];
                      return activeTab === "q-and-a" ? (
                        <DiscussionWorkspaceQuestionCard
                          key={thread.id}
                          thread={thread}
                          onNavigatePage={onNavigatePage}
                        />
                      ) : isCommentsTab ? (
                        <DiscussionWorkspaceCommentCard
                          key={thread.id}
                          thread={thread}
                          onNavigatePage={onNavigatePage}
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
                              {discussionStatus !== "open" && (
                                <i aria-hidden="true" />
                              )}
                            </div>
                            <div className="discussion-thread__body">
                              <span className="discussion-thread__title">
                                {thread.title ?? "Untitled discussion"}
                              </span>
                              <p>{thread.excerpt}</p>
                              {(thread.course || thread.lesson) && (
                                <div className="discussion-thread__context">
                                  {thread.course && (
                                    <span>{thread.course}</span>
                                  )}
                                  {thread.course && thread.lesson && (
                                    <span aria-hidden="true" />
                                  )}
                                  {thread.lesson && (
                                    <small>{thread.lesson}</small>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="discussion-thread__meta">
                              <span
                                className={`discussion-thread__status is-${discussionStatus}`}
                              >
                                <StatusIcon size={15} weight="fill" />{" "}
                                {statusLabels[discussionStatus]}
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
                      <h2>
                        {isNotesTab
                          ? query.trim() || selectedCourseId !== "all"
                            ? "No notes found"
                            : "No notes yet"
                          : isCommentsTab
                            ? "No comments match these filters"
                            : isMentionsTab
                              ? "No mentions match these filters"
                              : isFollowingTab
                                ? query.trim() || selectedCourseId !== "all"
                                  ? "No followed discussions found"
                                  : "No followed discussions yet"
                                : isBookmarksTab
                                  ? query.trim() || selectedCourseId !== "all"
                                    ? "No bookmarks found"
                                    : "No bookmarks yet"
                                  : "No discussions match these filters"}
                      </h2>
                      <p>
                        {isNotesTab
                          ? "Try clearing a filter or choosing another course."
                          : isCommentsTab
                            ? "Try clearing a filter or choosing another course."
                            : isMentionsTab
                              ? "Try clearing a filter or choosing another course."
                              : isFollowingTab
                                ? "Try clearing a filter or choosing another course."
                                : isBookmarksTab
                                  ? "Bookmarked discussions and notes will appear here."
                                  : "Try clearing a filter or start a new question for the course."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setCourse("all");
                          setStatus("all");
                          setSort("activity");
                          setQnaStatus("all");
                          setQnaSort("activity");
                          setNotesSort("activity");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <div
                    ref={loadMoreRef}
                    className="min-h-px"
                    aria-live="polite"
                  >
                    {isFetchingNextPage && (
                      <p className="py-3 text-center text-xs font-medium text-(--muted)">
                        {isCommentsTab
                          ? "Loading more comments…"
                          : isNotesTab
                            ? "Loading more notes…"
                            : isMentionsTab
                              ? "Loading more mentions…"
                              : isFollowingTab
                                ? "Loading more followed discussions…"
                                : isBookmarksTab
                                  ? "Loading more bookmarks…"
                                  : "Loading more discussions…"}
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
