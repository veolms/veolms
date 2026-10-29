import {
  Fragment,
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "../styles/features/discussions.css";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { elevatedCardTokenScopeClasses } from "../components/ElevatedCard";
import type { PublicPopularDiscussion } from "@veolms/contracts";
import type {
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { ReactElement, ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";
import {
  HighlightedText,
  SearchHighlightProvider,
} from "../lib/searchHighlight";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ChatTeardropTextIcon as ChatTeardropText } from "@phosphor-icons/react/ChatTeardropText";
import { ChatTextIcon as ChatText } from "@phosphor-icons/react/ChatText";
import { BellSimpleRingingIcon as BellSimpleRinging } from "@phosphor-icons/react/BellSimpleRinging";
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
import { XIcon as X } from "@phosphor-icons/react/X";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
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
import type { DiscussionContent } from "../learning/discussion-editor/types";
import { formatRelativeTime } from "../learning/learning-notes.adapter";
import { getCoursePlayerPath } from "../learning/coursePlayerNavigation";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerTitle,
} from "../components/ui/drawer";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import {
  adaptDiscussionWorkspaceItem,
  type DiscussionWorkspaceCard,
} from "./discussions-workspace.adapter";
import { DiscussionWorkspaceActionMenu } from "./DiscussionWorkspaceActionMenu";
import { DiscussionWorkspaceMobileActionSheet } from "./DiscussionWorkspaceMobileActionSheet";
import { DiscussionWorkspaceSkeletonList } from "./DiscussionWorkspaceSkeleton";
import {
  DiscussionWorkspaceVirtualFeed,
  getDiscussionWorkspaceItemKey,
} from "./DiscussionWorkspaceVirtualFeed";
import { DiscussionWorkspaceListRow } from "./DiscussionWorkspaceRow";
import { isRightPanelShortcut } from "../keyboardShortcuts";
import { DiscussionWorkspacePanel } from "./DiscussionWorkspacePanel";
import { useSettingsTabShortcuts } from "../settings/useSettingsTabShortcuts";
import { DiscussionCourseThumbnailsContext } from "./DiscussionCourseThumbnail";
import { useDiscussionWorkspaceReport } from "./useDiscussionWorkspaceReport";
import { useDiscussionWorkspaceCardLongPress } from "./useDiscussionWorkspaceCardLongPress";
import {
  getApplicationScrollElement,
  readApplicationScrollPosition,
  type ApplicationScrollPosition,
} from "../shell/applicationScroll";

type DiscussionStatus = NonNullable<DiscussionWorkspaceCard["status"]>;
type DiscussionEffectiveOwnership = "all" | "mine";
type DiscussionWorkspaceCardVariant = "default" | "compact";

const normalizeDiscussionRestorationValue = (
  value: string | undefined,
  fallback = "all",
) => {
  const normalized = value?.trim();
  return normalized || fallback;
};

const encodeDiscussionRestorationValue = (value: string) =>
  encodeURIComponent(normalizeDiscussionRestorationValue(value));

/**
 * The scroll position at which the tabs and filters stick to the top: the
 * page's header is above it, so a position up to there always fits, even
 * while a list is still loading or has nothing in it (its minimum height
 * keeps the page that tall).
 */
const getDiscussionStickPoint = (): number | null => {
  const region = document.querySelector<HTMLElement>(
    ".discussion-hub__sticky-region",
  );
  const header = region?.previousElementSibling;
  if (!region || !header) return null;
  const scrollport = getApplicationScrollElement();
  const viewportTop = scrollport ? scrollport.getBoundingClientRect().top : 0;
  const style = getComputedStyle(region);
  return Math.round(
    header.getBoundingClientRect().bottom -
      viewportTop +
      readApplicationScrollPosition().top +
      (parseFloat(style.marginTop) || 0) -
      (parseFloat(style.top) || 0),
  );
};

const canRestoreDiscussionScroll = ({ top }: ApplicationScrollPosition) => {
  if (top <= (getDiscussionStickPoint() ?? 0)) return true;

  const feed = document.querySelector<HTMLElement>(
    "[data-discussion-workspace-virtual-feed]",
  );
  // Still loading: the position is followed while the list grows.
  if (!feed) return true;

  const feedRect = feed.getBoundingClientRect();
  const scrollport = getApplicationScrollElement();
  const contentTop = scrollport
    ? feedRect.top -
      scrollport.getBoundingClientRect().top +
      scrollport.scrollTop
    : feedRect.top + window.scrollY;

  return contentTop + feedRect.height >= top;
};

/**
 * Where a tab opens, so that switching tabs never moves the tabs: a page
 * scrolled less than the tabs' sticking point stays where it is; with the
 * tabs stuck at the top they stay there, and the new list shows where it was
 * left (or its start). Never the page's top, nor a jump to the bottom.
 */
const chooseDiscussionTabScrollPosition = (
  remembered: ApplicationScrollPosition | undefined,
): ApplicationScrollPosition => {
  const current = readApplicationScrollPosition();
  const stickPoint = getDiscussionStickPoint();
  if (stickPoint === null) return remembered ?? { left: 0, top: 0 };
  if (current.top < stickPoint) return current;
  return {
    left: current.left,
    top: Math.max(stickPoint, remembered?.top ?? 0),
  };
};

/** The address parameter that names the discussion open in the panel. */
const OPEN_DISCUSSION_PARAM = "discussion";
/** The panel's discussion as written in the address: `thread.<id>`, which
 * needs no escaping (the list's own key is `thread:<id>`). */
const toOpenDiscussionParam = (key: string) => key.replace(":", ".");
const fromOpenDiscussionParam = (value: string | null) =>
  value ? value.replace(".", ":") : null;
/** How many more pages a reload loads to find that discussion. */
const OPEN_DISCUSSION_PAGE_LIMIT = 30;

function hasTextSelectionWithin(node: Node): boolean {
  if (typeof window === "undefined") return false;

  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    selection.toString().length === 0 ||
    selection.rangeCount === 0
  ) {
    return false;
  }

  return selection.getRangeAt(0).intersectsNode(node);
}

function isDiscussionCardInteractiveTarget(
  target: EventTarget | null,
): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, summary, [role="button"], [role="link"]',
      ),
    )
  );
}

function getVisibleCollapsedCardToggle(
  card: HTMLElement,
): HTMLButtonElement | null {
  const toggle = card.querySelector<HTMLButtonElement>(
    '.discussion-hub__card-content-toggle[aria-expanded="false"]',
  );
  if (!toggle || toggle.textContent?.trim() !== "Read more") return null;
  return toggle.getClientRects().length > 0 ? toggle : null;
}

interface DiscussionRestorationKeyInput {
  tab: DiscussionTab;
  courseId: string;
  ownership: DiscussionEffectiveOwnership;
  qnaStatus: string;
  qnaSort: string;
  notesSort: string;
  sort: string;
}

const getDiscussionRestorationKey = ({
  tab,
  courseId,
  ownership,
  qnaStatus,
  qnaSort,
  notesSort,
  sort,
}: DiscussionRestorationKeyInput) => {
  const effectiveTabOwnership =
    tab === "q-and-a" || tab === "comments" || tab === "notes"
      ? ownership
      : "all";
  const status = tab === "q-and-a" ? qnaStatus : "all";
  const tabSort =
    tab === "q-and-a"
      ? qnaSort
      : tab === "comments"
        ? sort
        : tab === "notes"
          ? notesSort
          : "default";

  return [
    "discussions",
    `tab=${encodeDiscussionRestorationValue(tab)}`,
    `course=${encodeDiscussionRestorationValue(courseId)}`,
    `ownership=${encodeDiscussionRestorationValue(effectiveTabOwnership)}`,
    `status=${encodeDiscussionRestorationValue(status)}`,
    `sort=${encodeDiscussionRestorationValue(tabSort)}`,
  ].join("|");
};

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
  /**
   * The session check has not answered yet. The page is put up all the same
   * (its heading, tabs and filters do not depend on the answer) and asks for
   * nothing until it has; the list shows its placeholders meanwhile.
   */
  sessionPending?: boolean;
}

const tabs: readonly {
  id: DiscussionTab;
  label: string;
  Icon: typeof Question;
  tone: PageTabTone;
}[] = [
  { id: "all", label: "All", Icon: ChatCircleDots, tone: "green" },
  {
    id: "comments",
    label: "Comments",
    Icon: ChatText,
    tone: "blue",
  },
  { id: "notes", label: "Notes", Icon: Note, tone: "gold" },
  { id: "q-and-a", label: "Q&A", Icon: Question, tone: "violet" },
  { id: "mentions", label: "Mentions", Icon: At, tone: "rose" },
  {
    id: "following",
    label: "Following",
    Icon: BellSimpleRinging,
    tone: "green",
  },
  { id: "saved", label: "Bookmarks", Icon: BookmarkSimple, tone: "gold" },
];

const discussionTabIds = tabs.map(({ id }) => id);

const DISCUSSION_SWIPE_PREVIEW_QUERY =
  "(max-width: 780px), (hover: none), (pointer: coarse)";

const subscribeToDiscussionSwipePreview = (listener: () => void) => {
  const media = window.matchMedia(DISCUSSION_SWIPE_PREVIEW_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

const getDiscussionSwipePreviewSnapshot = () =>
  window.matchMedia(DISCUSSION_SWIPE_PREVIEW_QUERY).matches;

const getDiscussionSwipePreviewServerSnapshot = () => false;

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
  thread:
    | DiscussionWorkspaceCard
    | Pick<PublicPopularDiscussion, "id" | "courseId" | "lessonId">,
): string {
  const threadId =
    "itemType" in thread && thread.itemType === "reply" && thread.parentThreadId
      ? thread.parentThreadId
      : thread.id;
  // The lesson shows the comment at the top of its discussion and highlights
  // it, rather than opening it as a thread.
  const basePath = getCoursePlayerPath(thread.courseId, 1, {
    threadId,
    threadFocus: "comment",
  });
  if (!thread.lessonId) return basePath;

  const [pathname, query = ""] = basePath.split("?", 2);
  const search = new URLSearchParams(query);
  search.set("lessonId", thread.lessonId);
  return `${pathname}?${search.toString()}`;
}

function getDiscussionNoteDestination(
  note: DiscussionWorkspaceCard,
): string | null {
  if (
    !note.id ||
    note.id.startsWith("client-") ||
    !note.courseId ||
    !note.lessonId
  )
    return null;

  const basePath = getCoursePlayerPath(note.courseId, 1, { noteId: note.id });
  const [pathname, query = ""] = basePath.split("?", 2);
  const search = new URLSearchParams(query);
  search.set("lessonId", note.lessonId);
  return `${pathname}?${search.toString()}`;
}

function DiscussionWorkspaceAttachmentIndicator({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={[
        "discussion-thread__attachment",
        "inline-flex items-center gap-1.5 text-xs text-(--muted)",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Paperclip size={15} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

type DiscussionWorkspaceMetadataItem = {
  key: string;
  content: ReactNode;
  mobileHidden?: boolean;
};

function getDiscussionWorkspaceMetadataItems(
  thread: DiscussionWorkspaceCard,
  options?: { timestampLabel?: string | null },
): DiscussionWorkspaceMetadataItem[] {
  const items: DiscussionWorkspaceMetadataItem[] = [];
  const attachmentLabel = getAttachmentLabel(thread.attachmentSummary);
  const visibilityLabel = getVisibilityLabel(thread.visibility);
  const hasPrimaryMobileMetadata = Boolean(thread.course && thread.lesson);
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
      mobileHidden: hasPrimaryMobileMetadata,
      content: (
        <small
          className={[
            "discussion-thread__timestamp",
            hasPrimaryMobileMetadata ? "is-mobile-hidden" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Clock size={13} aria-hidden="true" />
          <span>{options.timestampLabel}</span>
        </small>
      ),
    });
  }
  if (attachmentLabel) {
    items.push({
      key: "attachments",
      mobileHidden: hasPrimaryMobileMetadata,
      content: (
        <DiscussionWorkspaceAttachmentIndicator
          label={attachmentLabel}
          className={hasPrimaryMobileMetadata ? "is-mobile-hidden" : undefined}
        />
      ),
    });
  }
  if (visibilityLabel) {
    items.push({
      key: "visibility",
      mobileHidden: true,
      content: (
        <small className="discussion-thread__visibility is-mobile-hidden">
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
          {index > 0 && (
            <span
              className={[
                "discussion-thread__metadata-separator",
                item.mobileHidden ? "is-mobile-hidden" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            />
          )}
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
  expandable = true,
}: {
  thread: Pick<
    DiscussionWorkspaceCard,
    "author" | "plainText" | "excerpt" | "content"
  >;
  label: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  expandedTitle?: string | null;
  previewText?: string | null;
  parentContext?: string | null;
  expandable?: boolean;
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
  const canExpand = expandable && (hasAdditionalContent || isPreviewTruncated);
  const content = useMemo<DiscussionContent>(
    () => ({
      format: "markdown",
      markdown: thread.content.trim() || thread.plainText,
      plainText: thread.plainText,
    }),
    [thread.content, thread.plainText],
  );

  useEffect(() => {
    if (!expandable || expanded) return undefined;

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
  }, [collapsedPreview, expandable, expanded]);

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
    <div className="discussion-hub__card-content discussion-thread__selectable-text">
      {expanded ? (
        <div className="discussion-hub__card-content-expanded">
          {normalizedTitle && (
            <div className="discussion-hub__card-content-title">
              <HighlightedText text={normalizedTitle} />
            </div>
          )}
          <DiscussionMarkdown
            content={content}
            label={`${label} by ${thread.author}`}
            preserveSoftBreaks
            className="discussion-hub__card-expanded-markdown max-w-none"
          />
          {utility(true)}
        </div>
      ) : (
        <div className="discussion-hub__card-preview-row">
          <span ref={previewRef} className="discussion-hub__card-preview">
            <HighlightedText text={collapsedPreview} />
          </span>
          {utility(false)}
        </div>
      )}
    </div>
  );
}

function DiscussionWorkspaceIdentity({
  thread,
  activity,
}: {
  thread: Pick<DiscussionWorkspaceCard, "author" | "authorUsername" | "isOwn">;
  activity?: string;
}) {
  return (
    <div className="discussion-thread__author discussion-thread__selectable-text">
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
      {activity && (
        <>
          <span
            className="discussion-thread__author-activity-separator"
            aria-hidden="true"
          >
            ·
          </span>
          <time className="discussion-thread__author-activity">{activity}</time>
        </>
      )}
    </div>
  );
}

function DiscussionWorkspaceNavigationLink({
  destination,
  label,
  onNavigatePage,
  onBlocked,
}: {
  destination: string;
  label: string;
  onNavigatePage?: NavigateTo;
  onBlocked?: () => void;
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
        const card = event.currentTarget.parentElement;
        if (card && hasTextSelectionWithin(card)) return;
        if (!onNavigatePage) {
          event.preventDefault();
          onBlocked?.();
          return;
        }
        event.preventDefault();
        onNavigatePage(destination, { exact: true });
      }}
    />
  );
}

type DiscussionWorkspaceRailElement = ReactElement<{ className?: string }>;

type DiscussionWorkspaceCardShellThread = {
  title?: string | null;
  avatar?: string | null;
  avatarSrcSet?: PublicPopularDiscussion["author"]["avatarSrcSet"];
};

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
    <div className="discussion-thread__rail-inner">
      {withDiscussionWorkspaceRailSlot(top, "top")}
      {middle && withDiscussionWorkspaceRailSlot(middle, "middle")}
      {withDiscussionWorkspaceRailSlot(bottom, "bottom")}
    </div>
  );
}

function DiscussionWorkspaceCardShell({
  thread,
  className,
  expanded,
  variant = "default",
  expandable = true,
  navigation,
  onNavigate,
  actions,
  onMobileActions,
  children,
  rail,
}: {
  thread: DiscussionWorkspaceCardShellThread;
  className: string;
  expanded: boolean;
  variant?: DiscussionWorkspaceCardVariant;
  expandable?: boolean;
  navigation?: ReactNode;
  onNavigate?: () => void;
  actions?: ReactNode;
  onMobileActions?: () => void;
  children: ReactNode;
  rail: {
    top: DiscussionWorkspaceRailElement;
    middle?: DiscussionWorkspaceRailElement;
    bottom: DiscussionWorkspaceRailElement;
  };
}) {
  const isMobileOrCoarsePointer = useSyncExternalStore(
    subscribeToDiscussionSwipePreview,
    getDiscussionSwipePreviewSnapshot,
    getDiscussionSwipePreviewServerSnapshot,
  );
  const { isPressed: isLongPressPressed, ...longPressHandlers } =
    useDiscussionWorkspaceCardLongPress({
      enabled: Boolean(onMobileActions),
      onLongPress: () => onMobileActions?.(),
    });

  const handleBodyClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      (!onNavigate && !isMobileOrCoarsePointer) ||
      event.defaultPrevented ||
      isDiscussionCardInteractiveTarget(event.target) ||
      hasTextSelectionWithin(event.currentTarget)
    ) {
      return;
    }

    if (expandable && isMobileOrCoarsePointer && !expanded) {
      const readMore = getVisibleCollapsedCardToggle(event.currentTarget);
      if (readMore) {
        readMore.click();
        return;
      }
    }

    onNavigate?.();
  };

  return (
    <article
      {...longPressHandlers}
      className={[
        "discussion-thread",
        "discussion-thread--workspace-card",
        "select-none",
        className,
        navigation ? "is-navigable" : "is-static",
        variant === "compact" ? "is-compact" : "",
        expanded ? "is-expanded" : "is-collapsed",
        onMobileActions
          ? "transition-transform duration-100 ease-out motion-reduce:transition-none"
          : "",
        isLongPressPressed
          ? "scale-[0.985]"
          : onMobileActions
            ? "scale-100"
            : "",
      ].join(" ")}
    >
      {navigation}
      {onMobileActions && (
        <button
          type="button"
          className="sr-only"
          aria-haspopup="dialog"
          onClick={onMobileActions}
        >
          Actions for {thread.title?.trim() || "discussion"}
        </button>
      )}
      {actions}
      <div className="discussion-thread__open discussion-thread__open--overview">
        <div className="discussion-thread__avatar">
          <DiscussionAvatar
            src={thread.avatar || null}
            srcSet={thread.avatarSrcSet}
            className="discussion-thread__avatar-image"
            loading="lazy"
          />
        </div>
        <div className="discussion-thread__body" onClick={handleBodyClick}>
          {children}
        </div>
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
  showActions,
  onRequestMobileActions,
  setNotice,
  variant = "default",
  expandable = true,
}: {
  thread: DiscussionWorkspaceCard;
  onNavigatePage?: NavigateTo;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
  variant?: DiscussionWorkspaceCardVariant;
  expandable?: boolean;
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
      expanded={expandable && expanded}
      variant={variant}
      expandable={expandable}
      navigation={
        <DiscussionWorkspaceNavigationLink
          destination={destination}
          label={`Open question${
            destinationLabel ? ` in ${destinationLabel}` : ""
          }`}
          onNavigatePage={onNavigatePage}
        />
      }
      onNavigate={
        onNavigatePage
          ? () => onNavigatePage(destination, { exact: true })
          : undefined
      }
      onMobileActions={
        onRequestMobileActions
          ? () => onRequestMobileActions(thread, destination)
          : undefined
      }
      actions={
        showActions ? (
          <div className="absolute top-3 right-4 z-20 pointer-events-auto">
            <DiscussionWorkspaceActionMenu
              card={thread}
              destination={destination}
              setNotice={setNotice}
            />
          </div>
        ) : undefined
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
      <DiscussionWorkspaceIdentity thread={thread} activity={thread.activity} />
      <DiscussionWorkspaceCardContent
        thread={thread}
        label="Question"
        expanded={expandable && expanded}
        onExpandedChange={setExpanded}
        expandedTitle={thread.title}
        expandable={expandable}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceCommentCard({
  thread,
  onNavigatePage,
  showActions,
  onRequestMobileActions,
  setNotice,
  variant = "default",
  expandable = true,
}: {
  thread: DiscussionWorkspaceCard;
  onNavigatePage?: NavigateTo;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
  variant?: DiscussionWorkspaceCardVariant;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadataItems = getDiscussionWorkspaceMetadataItems(thread);
  const destination = getDiscussionThreadDestination(thread);
  const destinationLabel = [thread.course, thread.lesson]
    .filter(Boolean)
    .join(", ");

  return (
    <DiscussionWorkspaceCardShell
      thread={thread}
      className="discussion-thread--comment"
      expanded={expandable && expanded}
      variant={variant}
      expandable={expandable}
      navigation={
        <DiscussionWorkspaceNavigationLink
          destination={destination}
          label={`Open comment${
            destinationLabel ? ` in ${destinationLabel}` : ""
          }`}
          onNavigatePage={onNavigatePage}
        />
      }
      onNavigate={
        onNavigatePage
          ? () => onNavigatePage(destination, { exact: true })
          : undefined
      }
      onMobileActions={
        onRequestMobileActions
          ? () => onRequestMobileActions(thread, destination)
          : undefined
      }
      actions={
        showActions ? (
          <div className="absolute top-3 right-4 z-20 pointer-events-auto">
            <DiscussionWorkspaceActionMenu
              card={thread}
              destination={destination}
              setNotice={setNotice}
            />
          </div>
        ) : undefined
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
      <DiscussionWorkspaceIdentity thread={thread} activity={thread.activity} />
      <DiscussionWorkspaceCardContent
        thread={thread}
        label="Comment"
        expanded={expandable && expanded}
        onExpandedChange={setExpanded}
        expandable={expandable}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceFollowingCard({
  thread,
  onNavigatePage,
  showActions,
  onRequestMobileActions,
  setNotice,
}: {
  thread: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isQuestion = thread.kind === "question" || thread.kind === "qna";
  const metadataItems = getDiscussionWorkspaceMetadataItems(thread);
  const destination = getDiscussionThreadDestination(thread);
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
      onNavigate={() => onNavigatePage(destination, { exact: true })}
      onMobileActions={
        onRequestMobileActions
          ? () => onRequestMobileActions(thread, destination)
          : undefined
      }
      actions={
        showActions ? (
          <div className="absolute top-3 right-4 z-20 pointer-events-auto">
            <DiscussionWorkspaceActionMenu
              card={thread}
              destination={destination}
              setNotice={setNotice}
            />
          </div>
        ) : undefined
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
      <DiscussionWorkspaceIdentity thread={thread} activity={thread.activity} />
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
  showActions,
  onRequestMobileActions,
  setNotice,
}: {
  mention: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isReply = mention.itemType === "reply";
  const isNote = mention.itemType === "note" || mention.kind === "note";
  const isRootQuestion =
    !isReply &&
    !isNote &&
    (mention.kind === "question" || mention.kind === "qna");
  const metadataItems = getDiscussionWorkspaceMetadataItems(mention);
  const isQuestionMention =
    mention.kind === "question" || mention.kind === "qna";
  const parentKindLabel = isQuestionMention ? "Q&A" : "Comment";
  const MentionSourceIcon = isNote
    ? Note
    : isQuestionMention
      ? Question
      : ChatTeardropText;
  const mentionTypeLabel = isNote
    ? "Note"
    : isReply
      ? parentKindLabel + " Reply"
      : parentKindLabel;
  const parentContext = isReply
    ? mention.parentThreadTitle?.trim()
      ? `Reply in ${mention.parentThreadTitle.trim()} · ${parentKindLabel}`
      : `Reply in ${parentKindLabel}`
    : null;
  const destination = isNote
    ? getDiscussionNoteDestination(mention)
    : getDiscussionThreadDestination(mention);
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
        destination ? (
          <DiscussionWorkspaceNavigationLink
            destination={destination}
            label={`${
              isNote
                ? "Open note"
                : isReply
                  ? "Open parent discussion"
                  : "Open mentioned discussion"
            }${destinationLabel ? ` in ${destinationLabel}` : ""}`}
            onNavigatePage={onNavigatePage}
          />
        ) : undefined
      }
      onNavigate={
        destination
          ? () => onNavigatePage(destination, { exact: true })
          : undefined
      }
      onMobileActions={
        onRequestMobileActions
          ? () => onRequestMobileActions(mention, destination)
          : undefined
      }
      actions={
        showActions ? (
          <div className="absolute top-3 right-4 z-20 pointer-events-auto">
            <DiscussionWorkspaceActionMenu
              card={mention}
              destination={destination}
              setNotice={setNotice}
            />
          </div>
        ) : undefined
      }
      rail={{
        top: (
          <span
            className={[
              "discussion-thread__mention-indicator",
              "discussion-thread__rail-badge",
              isNote ? "is-note" : isQuestionMention ? "is-qna" : "is-comment",
            ].join(" ")}
          >
            <MentionSourceIcon size={15} weight="fill" aria-hidden="true" />
            <span>{mentionTypeLabel}</span>
          </span>
        ),
        middle: isNote ? undefined : (
          <span>
            <ChatTeardropText size={17} /> {mention.replies}{" "}
            {mention.replies === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: <time dateTime={mention.mentionedAt}>{mentionActivity}</time>,
      }}
    >
      <DiscussionWorkspaceIdentity
        thread={mention}
        activity={mentionActivity}
      />
      <DiscussionWorkspaceCardContent
        thread={mention}
        label={isNote ? "Note" : "Mention"}
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandedTitle={isNote || isRootQuestion ? mention.title : undefined}
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
  onNavigatePage,
  showActions,
  onRequestMobileActions,
  setNotice,
  variant = "default",
  expandable = true,
}: {
  note: DiscussionWorkspaceCard;
  onNavigatePage?: NavigateTo;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
  variant?: DiscussionWorkspaceCardVariant;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const timestampLabel = formatNoteTimestamp(note.timestampSeconds);
  const metadataItems = getDiscussionWorkspaceMetadataItems(note, {
    timestampLabel,
  });
  const destination = getDiscussionNoteDestination(note);
  const destinationLabel = [note.course, note.lesson]
    .filter(Boolean)
    .join(", ");

  return (
    <DiscussionWorkspaceCardShell
      thread={note}
      className="discussion-thread--note"
      expanded={expandable && expanded}
      variant={variant}
      expandable={expandable}
      navigation={
        destination ? (
          <DiscussionWorkspaceNavigationLink
            destination={destination}
            label={`Open note${
              destinationLabel ? ` in ${destinationLabel}` : ""
            }`}
            onNavigatePage={onNavigatePage}
          />
        ) : undefined
      }
      onNavigate={
        destination && onNavigatePage
          ? () => onNavigatePage(destination, { exact: true })
          : undefined
      }
      onMobileActions={
        onRequestMobileActions
          ? () => onRequestMobileActions(note, destination)
          : undefined
      }
      actions={
        showActions ? (
          <div className="absolute top-3 right-4 z-20 pointer-events-auto">
            <DiscussionWorkspaceActionMenu
              card={note}
              destination={destination}
              setNotice={setNotice}
            />
          </div>
        ) : undefined
      }
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
      <DiscussionWorkspaceIdentity thread={note} activity={note.activity} />
      <DiscussionWorkspaceCardContent
        thread={note}
        label="Note"
        onExpandedChange={setExpanded}
        expanded={expandable && expanded}
        expandedTitle={note.title}
        expandable={expandable}
      />
      <DiscussionWorkspaceMetadataRow items={metadataItems} />
    </DiscussionWorkspaceCardShell>
  );
}

export function DiscussionWorkspaceCard({
  card,
  onNavigatePage,
  variant = "default",
  expandable = true,
}: {
  card: DiscussionWorkspaceCard;
  onNavigatePage?: NavigateTo;
  variant?: DiscussionWorkspaceCardVariant;
  expandable?: boolean;
}) {
  if (card.itemType === "note" || card.kind === "note") {
    return (
      <DiscussionWorkspaceNoteCard
        note={card}
        onNavigatePage={onNavigatePage}
        showActions={false}
        variant={variant}
        expandable={expandable}
      />
    );
  }

  if (card.kind === "question" || card.kind === "qna") {
    return (
      <DiscussionWorkspaceQuestionCard
        thread={card}
        onNavigatePage={onNavigatePage}
        showActions={false}
        variant={variant}
        expandable={expandable}
      />
    );
  }

  return (
    <DiscussionWorkspaceCommentCard
      thread={card}
      onNavigatePage={onNavigatePage}
      showActions={false}
      variant={variant}
      expandable={expandable}
    />
  );
}

function PublicDiscussionMetadata({
  courseTitle,
  lessonTitle,
}: Pick<PublicPopularDiscussion, "courseTitle" | "lessonTitle">) {
  return (
    <div className="discussion-thread__context">
      <span title={courseTitle}>{courseTitle}</span>
      <span aria-hidden="true" />
      <small title={lessonTitle}>
        <BookOpen size={13} aria-hidden="true" />
        <span>{lessonTitle}</span>
      </small>
    </div>
  );
}

/**
 * Read-only public version of the compact workspace discussion card. It uses
 * the same shell, identity, content, metadata classes, and responsive rules
 * as Student Home without requiring workspace IDs, permissions, or queries.
 */
export function PublicDiscussionWorkspaceCard({
  discussion,
  onNavigatePage,
  allowPublicRead = false,
  hasCourseAccess = true,
  onAccessDenied,
}: {
  discussion: PublicPopularDiscussion;
  onNavigatePage?: NavigateTo;
  allowPublicRead?: boolean;
  hasCourseAccess?: boolean;
  onAccessDenied?: () => void;
}) {
  const author = discussion.author.displayName.trim() || "Anonymous Learner";
  const kindLabel = discussion.kind === "question" ? "Question" : "Comment";
  const title = discussion.title?.trim() || discussion.snippet;
  const preview = title;
  const activity = formatRelativeTime(discussion.updatedAt);
  const shellThread = {
    title: discussion.title,
    avatar: discussion.author.avatarUrl,
    avatarSrcSet: discussion.author.avatarSrcSet,
  };
  const contentThread = {
    author,
    content: discussion.snippet,
    plainText: discussion.snippet,
    excerpt: discussion.snippet,
  };
  const identityThread = {
    author,
    authorUsername: "",
    isOwn: false,
  };
  const destination = onNavigatePage
    ? getDiscussionThreadDestination(discussion)
    : null;
  const canNavigate = Boolean(
    destination && (allowPublicRead || hasCourseAccess),
  );
  const handleNavigation = canNavigate
    ? () => onNavigatePage?.(destination!, { exact: true })
    : onAccessDenied;

  return (
    <DiscussionWorkspaceCardShell
      thread={shellThread}
      className="discussion-thread--comment"
      expanded={false}
      variant="compact"
      expandable={false}
      navigation={
        destination ? (
          <DiscussionWorkspaceNavigationLink
            destination={canNavigate ? destination : "#"}
            label={`Open discussion in ${discussion.courseTitle}`}
            onNavigatePage={canNavigate ? onNavigatePage : undefined}
            onBlocked={canNavigate ? undefined : onAccessDenied}
          />
        ) : undefined
      }
      onNavigate={destination ? handleNavigation : undefined}
      rail={{
        top: (
          <span className="discussion-thread__engagement discussion-thread__rail-badge discussion-thread__likes-badge">
            <ThumbsUp size={15} weight="fill" aria-hidden="true" />
            <span>
              {discussion.likeCount}{" "}
              {discussion.likeCount === 1 ? "like" : "likes"}
            </span>
          </span>
        ),
        middle: (
          <span>
            <ChatTeardropText size={17} aria-hidden="true" />{" "}
            {discussion.replyCount}{" "}
            {discussion.replyCount === 1 ? "reply" : "replies"}
          </span>
        ),
        bottom: <time dateTime={discussion.updatedAt}>{activity}</time>,
      }}
    >
      <DiscussionWorkspaceIdentity
        thread={identityThread}
        activity={activity}
      />
      <DiscussionWorkspaceCardContent
        thread={contentThread}
        label={kindLabel}
        expanded={false}
        onExpandedChange={() => undefined}
        expandedTitle={null}
        previewText={preview}
        expandable={false}
      />
      <PublicDiscussionMetadata
        courseTitle={discussion.courseTitle}
        lessonTitle={discussion.lessonTitle}
      />
    </DiscussionWorkspaceCardShell>
  );
}

function DiscussionWorkspaceBookmarkCard({
  bookmark,
  onNavigatePage,
  showActions,
  onRequestMobileActions,
  setNotice,
}: {
  bookmark: DiscussionWorkspaceCard;
  onNavigatePage: NavigateTo;
  showActions: boolean;
  onRequestMobileActions?: (
    card: DiscussionWorkspaceCard,
    destination: string | null,
  ) => void;
  setNotice?: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNote = bookmark.itemType === "note" || bookmark.kind === "note";
  const isQuestion =
    !isNote && (bookmark.kind === "question" || bookmark.kind === "qna");
  const sourceLabel = isNote ? "Note" : isQuestion ? "Q&A" : "Comment";
  const SourceIcon = isNote ? Note : isQuestion ? Question : ChatTeardropText;
  const metadataItems = getDiscussionWorkspaceMetadataItems(bookmark);
  const destination = isNote
    ? getDiscussionNoteDestination(bookmark)
    : getDiscussionThreadDestination(bookmark);
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
      onNavigate={
        destination
          ? () => onNavigatePage(destination, { exact: true })
          : undefined
      }
      onMobileActions={
        onRequestMobileActions
          ? () => onRequestMobileActions(bookmark, destination)
          : undefined
      }
      actions={
        showActions ? (
          <div className="absolute top-3 right-4 z-20 pointer-events-auto">
            <DiscussionWorkspaceActionMenu
              card={bookmark}
              destination={destination}
              setNotice={setNotice}
            />
          </div>
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

interface MobileDiscussionActionTarget {
  card: DiscussionWorkspaceCard;
  destination: string | null;
}

export function DiscussionsWorkspace({
  role,
  tab = "all",
  onNavigatePage,
  setNotice,
  sessionPending = false,
}: DiscussionsWorkspaceProps) {
  const activeTab = normalizeDiscussionTab(tab);
  const location = useLocation();
  const showDiscussionSwipePreviews = useSyncExternalStore(
    subscribeToDiscussionSwipePreview,
    getDiscussionSwipePreviewSnapshot,
    getDiscussionSwipePreviewServerSnapshot,
  );
  const activeTabIndex = discussionTabIds.indexOf(activeTab);
  const [searchParams] = useSearchParams();
  const selectedCourseId = searchParams.get("course") ?? "all";
  const tablistRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fetchingNextPageRef = useRef(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, DEFAULT_DEBOUNCE_DELAY_MS);
  const [status, setStatus] = useState("all");
  // Newest first by default: the order the posts were written in.
  const [sort, setSort] = useState("latest");
  const [qnaStatus, setQnaStatus] = useState("all");
  const [qnaSort, setQnaSort] = useState("latest");
  const [notesSort, setNotesSort] = useState<"activity" | "latest">("activity");
  const [composer, setComposer] = useState<"question" | "discussion" | null>(
    null,
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileActionTarget, setMobileActionTarget] =
    useState<MobileDiscussionActionTarget | null>(null);
  const mobileFiltersTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileFiltersScrollPositionRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const mobileFiltersBodyLockRef = useRef<{
    position: string;
    top: string;
    width: string;
  } | null>(null);

  useEffect(() => {
    setMobileActionTarget(null);
  }, [activeTab]);

  // Every question and comment in one list. (Notes are kept apart by the
  // server and are not in it.)
  const isAllTab = activeTab === "all";
  const isQnaTab = activeTab === "q-and-a";
  const isCommentsTab = activeTab === "comments";
  const isNotesTab = activeTab === "notes";
  const isMentionsTab = activeTab === "mentions";
  const isFollowingTab = activeTab === "following";
  const isBookmarksTab = activeTab === "saved";
  const activeLoadingLabel = isNotesTab
    ? "Loading notes"
    : isCommentsTab
      ? "Loading comments"
      : isMentionsTab
        ? "Loading mentions"
        : isFollowingTab
          ? "Loading followed discussions"
          : isBookmarksTab
            ? "Loading bookmarks"
            : "Loading discussions";
  const workspaceStatus = isQnaTab ? qnaStatus : status;
  const workspaceSort = isQnaTab ? qnaSort : sort;
  const effectiveOwnership: DiscussionEffectiveOwnership =
    role === "student" ? "mine" : "all";

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
        ...(effectiveOwnership === "mine" ? { mine: true } : {}),
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
      ...(isQnaTab || isCommentsTab || isAllTab
        ? effectiveOwnership === "mine"
          ? { mine: true }
          : {}
        : {}),
      ...(isCommentsTab || isAllTab
        ? {}
        : {
            status: workspaceStatus as
              "all" | "answered" | "mentioned" | "solved" | "open",
          }),
      sort: workspaceSort as "activity" | "latest" | "replies",
    };
  })();

  const currentDiscussionPath = `${location.pathname}${location.search}${location.hash}`;
  const effectiveSearch = debouncedQuery.trim();
  const getRestorationKeyForTab = (
    tabId: DiscussionTab,
    overrides: {
      courseId?: string;
      sort?: string;
      status?: string;
    } = {},
  ) =>
    getDiscussionRestorationKey({
      tab: tabId,
      courseId: overrides.courseId ?? selectedCourseId,
      ownership: effectiveOwnership,
      qnaStatus:
        tabId === "q-and-a" && overrides.status ? overrides.status : qnaStatus,
      qnaSort: tabId === "q-and-a" && overrides.sort ? overrides.sort : qnaSort,
      notesSort:
        tabId === "notes" && overrides.sort ? overrides.sort : notesSort,
      sort: tabId === "comments" && overrides.sort ? overrides.sort : sort,
    });
  const discussionRestorationKey = getRestorationKeyForTab(activeTab);
  const transitionDiscussionScroll = ({
    destinationKey,
    reset = false,
  }: {
    destinationKey: string;
    reset?: boolean;
  }) => {
    onNavigatePage(currentDiscussionPath, {
      captureScroll: !reset,
      canRestoreScroll: canRestoreDiscussionScroll,
      exact: true,
      resetScroll: reset,
      replace: true,
      scrollRestorationKey: destinationKey,
      sourceScrollRestorationKey: discussionRestorationKey,
    });
  };
  const previousEffectiveSearchRef = useRef(effectiveSearch);
  useEffect(() => {
    if (previousEffectiveSearchRef.current === effectiveSearch) return;
    previousEffectiveSearchRef.current = effectiveSearch;
    onNavigatePage(currentDiscussionPath, {
      captureScroll: false,
      exact: true,
      replace: true,
      resetScroll: true,
    });
  }, [currentDiscussionPath, effectiveSearch, onNavigatePage]);

  const navigateTab = (id: DiscussionTab) => {
    rememberDiscussionTab(id);
    const nextSearch = new URLSearchParams();
    if (selectedCourseId !== "all") nextSearch.set("course", selectedCourseId);
    const suffix = nextSearch.toString();
    onNavigatePage(`/discussions/${id}${suffix ? `?${suffix}` : ""}`, {
      captureScroll: effectiveSearch.length === 0,
      canRestoreScroll: canRestoreDiscussionScroll,
      chooseScrollPosition: chooseDiscussionTabScrollPosition,
      resetScroll: effectiveSearch.length > 0,
      scrollRestorationKey: getRestorationKeyForTab(id),
      sourceScrollRestorationKey: discussionRestorationKey,
    });
  };
  // As in Settings: the left and right arrows move between the tabs, unless
  // the focus is in the open discussion's panel, where they step through
  // the list instead.
  useSettingsTabShortcuts({
    tabIds: discussionTabIds,
    getCurrentTab: () => activeTab,
    onNavigate: navigateTab,
  });
  const workspaceDatasetKey = JSON.stringify(workspaceQuery);
  const workspaceQueryResult = useDiscussionsWorkspace(workspaceQuery, {
    enabled: !sessionPending,
  });
  const {
    data: workspaceData,
    isPending: isWorkspacePending,
    isLoadingError,
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
  // Thumbnails of the courses, for the small picture in the open
  // discussion's panel.
  const courseThumbnails = new Map<
    string,
    { url?: string | null; mediaId?: string | null }
  >();
  workspaceData?.pages.forEach((page) => {
    page.courses.forEach((courseOption) => {
      if (courseOption.thumbnailUrl || courseOption.thumbnailMediaId) {
        courseThumbnails.set(courseOption.id, {
          url: courseOption.thumbnailUrl,
          mediaId: courseOption.thumbnailMediaId,
        });
      }
    });
  });
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
    const normalizedCourseId = normalizeDiscussionRestorationValue(courseId);
    if (normalizedCourseId === selectedCourseId) return;

    const nextSearch = new URLSearchParams(searchParams);
    if (normalizedCourseId === "all") nextSearch.delete("course");
    else nextSearch.set("course", normalizedCourseId);
    const suffix = nextSearch.toString();
    const nextPath = `${location.pathname}${suffix ? `?${suffix}` : ""}${location.hash}`;

    onNavigatePage(nextPath, {
      captureScroll: effectiveSearch.length === 0,
      canRestoreScroll: canRestoreDiscussionScroll,
      exact: true,
      resetScroll: effectiveSearch.length > 0,
      replace: true,
      scrollRestorationKey: getRestorationKeyForTab(activeTab, {
        courseId: normalizedCourseId,
      }),
      sourceScrollRestorationKey: discussionRestorationKey,
    });
  };

  const setDiscussionStatus = (nextStatus: string) => {
    if (isQnaTab) {
      if (nextStatus === qnaStatus) return;
      setQnaStatus(nextStatus);
    } else {
      if (nextStatus === status) return;
      setStatus(nextStatus);
    }
    transitionDiscussionScroll({
      destinationKey: getRestorationKeyForTab(activeTab, {
        status: nextStatus,
      }),
      reset: effectiveSearch.length > 0,
    });
  };

  const setDiscussionSort = (nextSort: string) => {
    const currentSort = isQnaTab ? qnaSort : isNotesTab ? notesSort : sort;
    if (nextSort === currentSort) return;

    if (isQnaTab) setQnaSort(nextSort);
    else if (isNotesTab) setNotesSort(nextSort as "activity" | "latest");
    else setSort(nextSort);
    transitionDiscussionScroll({
      destinationKey: getRestorationKeyForTab(activeTab, { sort: nextSort }),
      reset: effectiveSearch.length > 0,
    });
  };

  // What "Clear filters" can undo: the search, the course, and on Q&A the
  // status.
  const hasClearableDiscussionFilters =
    Boolean(query.trim()) ||
    selectedCourseId !== "all" ||
    (isQnaTab && qnaStatus !== "all");

  const resetDiscussionFilters = () => {
    const nextPathSearch = new URLSearchParams(searchParams);
    nextPathSearch.delete("course");
    const nextPathSearchString = nextPathSearch.toString();
    const nextPath = `${location.pathname}${nextPathSearchString ? `?${nextPathSearchString}` : ""}${location.hash}`;
    const destinationKey = getDiscussionRestorationKey({
      tab: activeTab,
      courseId: "all",
      ownership: effectiveOwnership,
      qnaStatus: "all",
      qnaSort: "latest",
      notesSort: "activity",
      sort: "latest",
    });

    if (isQnaTab) {
      setQnaStatus("all");
      setQnaSort("latest");
    } else if (isCommentsTab || isAllTab) {
      setSort("latest");
    } else if (isNotesTab) {
      setNotesSort("activity");
    }
    onNavigatePage(nextPath, {
      captureScroll: effectiveSearch.length === 0,
      canRestoreScroll: canRestoreDiscussionScroll,
      exact: true,
      resetScroll: effectiveSearch.length > 0,
      replace: true,
      scrollRestorationKey: destinationKey,
      sourceScrollRestorationKey: discussionRestorationKey,
    });
  };

  const captureMobileFiltersScrollPosition = () => {
    const scrollElement = loadMoreRef.current
      ? findScrollableAncestor(loadMoreRef.current)
      : null;
    const element =
      scrollElement ?? (document.scrollingElement as HTMLElement | null);
    if (element) {
      mobileFiltersScrollPositionRef.current = {
        element,
        top:
          element === document.scrollingElement
            ? window.scrollY
            : element.scrollTop,
      };
    }
  };

  const openMobileFilters = () => {
    if (!mobileFiltersScrollPositionRef.current) {
      captureMobileFiltersScrollPosition();
    }
    const saved = mobileFiltersScrollPositionRef.current;
    if (saved && !mobileFiltersBodyLockRef.current) {
      mobileFiltersBodyLockRef.current = {
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width,
      };
      document.body.style.position = "fixed";
      document.body.style.top = `-${saved.top}px`;
      document.body.style.width = "100%";
    }
    setMobileFiltersOpen(true);
  };

  const restoreMobileFiltersScrollPosition = () => {
    const saved = mobileFiltersScrollPositionRef.current;
    if (!saved) return;
    const restore = () => {
      const bodyLock = mobileFiltersBodyLockRef.current;
      if (bodyLock) {
        document.body.style.position = bodyLock.position;
        document.body.style.top = bodyLock.top;
        document.body.style.width = bodyLock.width;
        mobileFiltersBodyLockRef.current = null;
      }
      saved.element.scrollTop = saved.top;
      if (saved.element === document.scrollingElement) {
        window.scrollTo({ top: saved.top, left: 0, behavior: "auto" });
      }
      mobileFiltersTriggerRef.current?.focus({ preventScroll: true });
    };
    window.setTimeout(() => {
      restore();
      window.requestAnimationFrame(() => {
        restore();
        mobileFiltersScrollPositionRef.current = null;
      });
    }, 200);
  };

  const closeMobileFilters = () => {
    restoreMobileFiltersScrollPosition();
    setMobileFiltersOpen(false);
  };

  const handleMobileFiltersOpenChange = (open: boolean) => {
    if (!open) restoreMobileFiltersScrollPosition();
    setMobileFiltersOpen(open);
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

  // The discussion open in the panel beside the list, if any.
  const [openPanelCard, setOpenPanelCard] =
    useState<DiscussionWorkspaceCard | null>(null);
  // Whether the open discussion's own text is being edited ("Edit").
  const [isEditingPanelCard, setIsEditingPanelCard] = useState(false);
  // The discussion last open, which the panel shows again when it is
  // brought back after being closed.
  const [lastPanelKey, setLastPanelKey] = useState<string | null>(null);
  const openPanel = useCallback(
    (card: DiscussionWorkspaceCard) => {
      setOpenPanelCard(card);
      setIsEditingPanelCard(false);
      setLastPanelKey(getDiscussionWorkspaceItemKey(card));
    },
    [setIsEditingPanelCard, setOpenPanelCard],
  );
  const editInPanel = useCallback(
    (card: DiscussionWorkspaceCard) => {
      setOpenPanelCard(card);
      setIsEditingPanelCard(true);
      setLastPanelKey(getDiscussionWorkspaceItemKey(card));
    },
    [setIsEditingPanelCard, setOpenPanelCard],
  );
  const closePanel = useCallback(() => {
    setOpenPanelCard(null);
    setIsEditingPanelCard(false);
  }, [setIsEditingPanelCard, setOpenPanelCard]);
  // Another tab is another list. The open discussion stays open: once the
  // new list is in, it stays selected if the list has it too (a Q&A opened
  // from All, then the Q&A tab), and otherwise the list's first item opens.
  const tabWhenPanelSettledRef = useRef(activeTab);
  const [tabSwitchPending, setTabSwitchPending] = useState(false);
  useEffect(() => {
    if (tabWhenPanelSettledRef.current === activeTab) return;
    tabWhenPanelSettledRef.current = activeTab;
    setIsEditingPanelCard(false);
    setTabSwitchPending(true);
  }, [activeTab, setIsEditingPanelCard]);
  useEffect(() => {
    if (!tabSwitchPending || isWorkspacePending) return;
    setTabSwitchPending(false);
    if (!openPanelCard) return;
    const openKey = getDiscussionWorkspaceItemKey(openPanelCard);
    if (cards.some((card) => getDiscussionWorkspaceItemKey(card) === openKey))
      return;
    // An empty list keeps the panel open; it says there is nothing to show.
    const first = cards[0];
    if (first) openPanel(first);
  }, [cards, isWorkspacePending, openPanel, openPanelCard, tabSwitchPending]);
  // The sticky tabs and filters' height, for the list's minimum height.
  const stickyRegionRef = useRef<HTMLDivElement>(null);
  const [stickyRegionHeight, setStickyRegionHeight] = useState(0);
  useEffect(() => {
    const region = stickyRegionRef.current;
    if (!region || typeof ResizeObserver === "undefined") return undefined;
    const measure = () =>
      setStickyRegionHeight(Math.round(region.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);
  // Brings the panel back: with the discussion last open if it is in this
  // list, otherwise with the list's first.
  const reopenPanel = () => {
    const card =
      cards.find(
        (item) => getDiscussionWorkspaceItemKey(item) === lastPanelKey,
      ) ?? cards[0];
    if (card) openPanel(card);
  };
  // The open discussion is in the address (`?discussion=<type>:<id>`), so a
  // reload or a shared link opens it again. Read once: the list may first
  // have to load further pages to reach it.
  const [pendingPanelKey, setPendingPanelKey] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : fromOpenDiscussionParam(
          new URLSearchParams(window.location.search).get(
            OPEN_DISCUSSION_PARAM,
          ),
        ),
  );
  const restorePagesRef = useRef(0);
  useEffect(() => {
    if (!pendingPanelKey || isWorkspacePending) return;
    const card = cards.find(
      (item) => getDiscussionWorkspaceItemKey(item) === pendingPanelKey,
    );
    if (card) {
      openPanel(card);
      setPendingPanelKey(null);
      return;
    }
    if (hasNextPage && restorePagesRef.current < OPEN_DISCUSSION_PAGE_LIMIT) {
      if (!isFetchingNextPage) {
        restorePagesRef.current += 1;
        loadMore();
      }
      return;
    }
    // Not in this list (deleted, hidden, or another tab's): the address
    // lets go of it below.
    setPendingPanelKey(null);
  }, [
    cards,
    hasNextPage,
    isFetchingNextPage,
    isWorkspacePending,
    loadMore,
    openPanel,
    pendingPanelKey,
  ]);
  // The address follows the panel. Written with the history entry's own
  // state kept (React Router's, and the Back-closes-the-panel entry of a
  // tablet or phone), and again after any navigation within the page.
  // Open with nothing to show: this tab (or these filters) has no items.
  const panelIsEmpty =
    Boolean(openPanelCard) && !isWorkspacePending && cards.length === 0;
  const openPanelUrlKey =
    openPanelCard && !panelIsEmpty
      ? getDiscussionWorkspaceItemKey(openPanelCard)
      : null;
  useEffect(() => {
    if (pendingPanelKey) return;
    const url = new URL(window.location.href);
    if (openPanelUrlKey)
      url.searchParams.set(
        OPEN_DISCUSSION_PARAM,
        toOpenDiscussionParam(openPanelUrlKey),
      );
    else url.searchParams.delete(OPEN_DISCUSSION_PARAM);
    if (url.href === window.location.href) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [location.key, openPanelUrlKey, pendingPanelKey]);
  // Ctrl/⌘+Alt+B, the right-side panel's shortcut across the app, opens
  // and closes the discussion beside the list (reopening the last one).
  const togglePanelRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    togglePanelRef.current = openPanelCard ? closePanel : reopenPanel;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !isRightPanelShortcut(event)) return;
      event.preventDefault();
      togglePanelRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const { openReport, reportDialog } = useDiscussionWorkspaceReport(setNotice);
  const openMobileActions = useCallback(
    (card: DiscussionWorkspaceCard, destination: string | null) => {
      setMobileActionTarget({ card, destination });
    },
    [],
  );
  const closeMobileActions = useCallback(() => {
    setMobileActionTarget(null);
  }, []);

  const renderDiscussionCard = useCallback(
    (card: DiscussionWorkspaceCard) => {
      const destination =
        card.itemType === "note" || card.kind === "note"
          ? getDiscussionNoteDestination(card)
          : getDiscussionThreadDestination(card);
      return (
        <DiscussionWorkspaceListRow
          card={card}
          destination={destination}
          selected={
            openPanelCard !== null &&
            getDiscussionWorkspaceItemKey(openPanelCard) ===
              getDiscussionWorkspaceItemKey(card)
          }
          onOpen={openPanel}
          onClose={closePanel}
          onNavigatePage={onNavigatePage}
          onEdit={editInPanel}
          onReport={openReport}
          showActions={!showDiscussionSwipePreviews}
          onRequestMobileActions={
            showDiscussionSwipePreviews ? openMobileActions : undefined
          }
          setNotice={setNotice}
        />
      );
    },
    [
      closePanel,
      editInPanel,
      onNavigatePage,
      openMobileActions,
      openPanel,
      openPanelCard,
      openReport,
      setNotice,
      showDiscussionSwipePreviews,
    ],
  );

  const renderDiscussionFilterControls = (inSheet = false) => {
    const field = (label: string, control: ReactNode) =>
      inSheet ? (
        <div className="discussion-hub__filter-sheet-field">
          <span>{label}</span>
          {control}
        </div>
      ) : (
        control
      );
    const selectContentClassName = inSheet
      ? "discussion-hub__select-content discussion-hub__filter-sheet-select-content"
      : "discussion-hub__select-content";

    return (
      <>
        {field(
          "Course",
          <div className="discussion-hub__select">
            <ThemedSelect
              onValueChange={setCourse}
              ariaLabel="Filter discussions by course"
              searchable
              searchPlaceholder="Search courses..."
              defaultLimit={8}
              triggerClassName="discussion-hub__select-trigger"
              contentClassName={selectContentClassName}
              menuMaxWidth={inSheet ? Number.POSITIVE_INFINITY : undefined}
              matchMenuToContainer={
                isAllTab ||
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
          </div>,
        )}
        {!isAllTab &&
          !isCommentsTab &&
          !isNotesTab &&
          !isMentionsTab &&
          !isFollowingTab &&
          !isBookmarksTab &&
          field(
            "Status",
            <div className="discussion-hub__select">
              <ThemedSelect
                value={isQnaTab ? qnaStatus : status}
                onValueChange={setDiscussionStatus}
                ariaLabel="Filter discussions by status"
                triggerClassName="discussion-hub__select-trigger"
                contentClassName={selectContentClassName}
                menuMaxWidth={inSheet ? Number.POSITIVE_INFINITY : undefined}
                matchMenuToContainer={isQnaTab}
                options={
                  isQnaTab
                    ? ([
                        ["all", "All"],
                        ["open", "Open"],
                        ["answered", "Answered"],
                        ["solved", "Solved"],
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
            </div>,
          )}
        {isMentionsTab || isFollowingTab || isBookmarksTab
          ? null
          : isNotesTab
            ? field(
                "Sort",
                <div className="discussion-hub__select discussion-hub__select--sort">
                  <Funnel size={17} aria-hidden="true" />
                  <ThemedSelect<"activity" | "latest">
                    value={notesSort}
                    onValueChange={setDiscussionSort}
                    ariaLabel={`Sort notes: ${
                      notesSort === "activity" ? "Latest activity" : "Newest"
                    }`}
                    triggerClassName="discussion-hub__select-trigger"
                    contentClassName={selectContentClassName}
                    menuMaxWidth={
                      inSheet ? Number.POSITIVE_INFINITY : undefined
                    }
                    matchMenuToContainer
                    options={[
                      ["activity", "Latest activity"],
                      ["latest", "Newest"],
                    ]}
                  />
                </div>,
              )
            : field(
                "Sort",
                <div className="discussion-hub__select discussion-hub__select--sort">
                  <Funnel size={17} aria-hidden="true" />
                  <ThemedSelect
                    value={isQnaTab ? qnaSort : sort}
                    onValueChange={setDiscussionSort}
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
                    contentClassName={selectContentClassName}
                    menuMaxWidth={
                      inSheet ? Number.POSITIVE_INFINITY : undefined
                    }
                    matchMenuToContainer={isQnaTab || isCommentsTab || isAllTab}
                    options={
                      isQnaTab
                        ? ([
                            ["latest", "Newest"],
                            ["activity", "Latest activity"],
                            ["replies", "Most replies"],
                          ] as const)
                        : ([
                            ["latest", "Newest"],
                            ["activity", "Latest activity"],
                            ["replies", "Most replies"],
                          ] as const)
                    }
                  />
                </div>,
              )}
      </>
    );
  };

  const discussionFilters = (
    <section
      className={`discussion-hub__filters ${
        isFollowingTab
          ? "discussion-hub__filters--following"
          : isBookmarksTab
            ? "discussion-hub__filters--bookmarks"
            : isMentionsTab
              ? "discussion-hub__filters--mentions"
              : isCommentsTab || isNotesTab || isAllTab
                ? "discussion-hub__filters--comments"
                : ""
      } overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      // The filters keep their widths; where the page is too narrow for them
      // (the discussion panel open beside it) the row scrolls sideways.
      aria-label="Filter discussions"
    >
      <div className="discussion-hub__filter-toolbar" data-filter-bar="">
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
        <button
          ref={mobileFiltersTriggerRef}
          type="button"
          // An icon alone on a phone, the search field keeping the room.
          className="discussion-hub__mobile-filter-trigger aspect-square w-11 px-0!"
          title="Filter"
          aria-controls="discussion-filters-sheet"
          aria-expanded={mobileFiltersOpen}
          aria-haspopup="dialog"
          onPointerDownCapture={captureMobileFiltersScrollPosition}
          onMouseDown={captureMobileFiltersScrollPosition}
          onClick={openMobileFilters}
        >
          <Funnel size={18} aria-hidden="true" />
          <span className="sr-only">Filter</span>
        </button>
        <div className="discussion-hub__filter-controls">
          {renderDiscussionFilterControls()}
        </div>
      </div>
    </section>
  );

  // Where the open discussion is in this tab's list, for previous and next.
  const openPanelKey = openPanelCard
    ? getDiscussionWorkspaceItemKey(openPanelCard)
    : null;
  const openPanelIndex =
    openPanelKey === null
      ? -1
      : cards.findIndex(
          (card) => getDiscussionWorkspaceItemKey(card) === openPanelKey,
        );
  // The list's own copy of the open card, so a like or an edit made in the
  // panel shows there at once.
  const livePanelCard =
    openPanelIndex >= 0
      ? (cards[openPanelIndex] ?? openPanelCard)
      : openPanelCard;
  // What the panel holds: the open discussion, or while it is closed the
  // one it would open with (the last open, else the list's first). On a
  // desktop the closed panel stays at the frame's edge, where its gutter
  // brings it back, as the lesson page's course content does.
  const panelCard =
    livePanelCard ??
    cards.find(
      (item) => getDiscussionWorkspaceItemKey(item) === lastPanelKey,
    ) ??
    cards[0] ??
    null;
  // The row the list scrolls into view: only one the panel stepped to with
  // its arrows. A discussion opened any other way (a click, a tab switch
  // opening the new list's first) leaves the page where it is.
  const [steppedPanelKey, setSteppedPanelKey] = useState<string | null>(null);
  const stepPanel = (step: -1 | 1) => {
    const nextCard = cards[openPanelIndex + step];
    if (openPanelIndex < 0 || !nextCard) return;
    setSteppedPanelKey(getDiscussionWorkspaceItemKey(nextCard));
    openPanel(nextCard);
  };

  return (
    <SearchHighlightProvider value={effectiveSearch}>
      <div className="flex min-w-0 items-start">
        <div
          className={`discussion-hub min-w-0 flex-1 ${elevatedCardTokenScopeClasses}`}
          style={
            {
              "--discussion-sticky-height": `${stickyRegionHeight}px`,
            } as CSSProperties
          }
          aria-labelledby="discussions-title"
        >
          <header className="discussion-hub__header">
            <div>
              <h1 id="discussions-title">Discussions</h1>
              <p>All your discussions in one place.</p>
            </div>
            <span className="discussion-hub__header-icon" aria-hidden="true">
              <ChatCircleDots size={28} weight="duotone" />
            </span>
          </header>

          <div ref={stickyRegionRef} className="discussion-hub__sticky-region">
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
                  // Built like a Settings tab: the same corners, icon size and
                  // press feedback (see SettingsPage and discussions.css).
                  className={`group rounded-t-lg! rounded-b-none! ${activeTab === id ? "is-active" : ""}`}
                  onClick={() => navigateTab(id)}
                  onKeyDown={handleRovingTabKeyDown}
                  onFocus={scrollKeyboardFocusedTabIntoView}
                >
                  <span className="inline-flex origin-bottom items-center gap-2 transition-transform duration-150 ease-out group-active:scale-[0.985] motion-reduce:duration-[0.01ms]">
                    <Icon
                      size={17}
                      weight={activeTab === id ? "fill" : "regular"}
                    />
                    <span>{label}</span>
                  </span>
                </button>
              ))}
              <span className="page-tabs__indicator" aria-hidden="true" />
            </nav>
            {discussionFilters}
          </div>

          <Drawer
            modal={false}
            open={mobileFiltersOpen}
            onOpenChange={handleMobileFiltersOpenChange}
            onOpenChangeComplete={(open) => {
              if (!open) restoreMobileFiltersScrollPosition();
            }}
            showSwipeHandle
          >
            <DrawerOverlay onClick={closeMobileFilters} />
            <DrawerContent
              id="discussion-filters-sheet"
              finalFocus={false}
              aria-labelledby="discussion-filters-title"
              aria-describedby="discussion-filters-description"
              className="discussion-hub__filter-sheet"
              style={
                {
                  "--drawer-content-max-height":
                    "min(720px, calc(100dvh - 16px))",
                } as CSSProperties
              }
            >
              <div className="discussion-hub__filter-sheet-inner">
                <header className="discussion-hub__filter-sheet-header">
                  <div>
                    <DrawerTitle
                      id="discussion-filters-title"
                      className="discussion-hub__filter-sheet-title"
                    >
                      Filters
                    </DrawerTitle>
                    <DrawerDescription
                      id="discussion-filters-description"
                      className="discussion-hub__filter-sheet-description"
                    >
                      Filter the current Discussions view.
                    </DrawerDescription>
                  </div>
                  <button
                    type="button"
                    className="discussion-hub__filter-sheet-close"
                    aria-label="Close filters"
                    onClick={closeMobileFilters}
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>
                <div className="discussion-hub__filter-sheet-fields">
                  {renderDiscussionFilterControls(true)}
                </div>
                <footer className="discussion-hub__filter-sheet-footer">
                  <button
                    type="button"
                    className="discussion-hub__filter-sheet-reset"
                    onClick={resetDiscussionFilters}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="discussion-hub__filter-sheet-done"
                    onClick={closeMobileFilters}
                  >
                    Done
                  </button>
                </footer>
              </div>
            </DrawerContent>
          </Drawer>

          {mobileActionTarget && (
            <DiscussionWorkspaceMobileActionSheet
              card={mobileActionTarget.card}
              destination={mobileActionTarget.destination}
              onClose={closeMobileActions}
              setNotice={setNotice}
              onEdit={editInPanel}
              onReport={openReport}
            />
          )}

          <DiscussionCourseThumbnailsContext.Provider value={courseThumbnails}>
            <SwipeableTabPanel
              tabs={discussionTabIds}
              activeTab={activeTab}
              onTabChange={navigateTab}
              tabListRef={tablistRef}
              id="discussion-panel"
              labelledBy={`discussion-tab-${activeTab}`}
              slideClassName="pb-8"
              // At least a screen below the sticky tabs and filters: switching
              // to a short or empty tab while scrolled down then leaves the page
              // where it is, instead of the browser pulling it back to the new,
              // nearer bottom.
              // The swiper fills that height too, so a sideways swipe on the
              // empty space under a short or empty tab changes tabs as well.
              className="min-h-[calc(100dvh-var(--shell-frame-block-space,22px)-var(--discussion-sticky-height,0px))] [&>.swipeable-tab-panel\_\_swiper]:min-h-[inherit]"
              stateAttribute="data-discussion-tab"
              spaceBetweenOffset={14}
            >
              {(panelTab, preview) => {
                const isActivePanel = panelTab === activeTab;
                const isAdjacentPanel =
                  preview &&
                  showDiscussionSwipePreviews &&
                  Math.abs(
                    discussionTabIds.indexOf(panelTab) - activeTabIndex,
                  ) === 1;

                if (!isActivePanel) {
                  return isAdjacentPanel ? (
                    <DiscussionWorkspaceSkeletonList
                      mode="preview"
                      variant={panelTab}
                      previewCount={cards.length}
                    />
                  ) : (
                    <div
                      className="discussion-hub__layout"
                      aria-hidden="true"
                    />
                  );
                }

                return (
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
                        <div
                          className="discussion-hub__thread-list"
                          aria-live="polite"
                        >
                          {isWorkspacePending ? (
                            <DiscussionWorkspaceSkeletonList
                              mode="loading"
                              variant={activeTab}
                              label={activeLoadingLabel}
                              withinFeed
                            />
                          ) : isLoadingError ? (
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
                                {isNotesTab
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
                              <button
                                type="button"
                                onClick={() => void refetch()}
                              >
                                Retry
                              </button>
                            </div>
                          ) : cards.length > 0 ? (
                            <DiscussionWorkspaceVirtualFeed
                              cards={cards}
                              datasetKey={workspaceDatasetKey}
                              focusKey={
                                steppedPanelKey === openPanelUrlKey
                                  ? steppedPanelKey
                                  : null
                              }
                              renderCard={renderDiscussionCard}
                            />
                          ) : (
                            <div className="discussion-hub__empty">
                              <UsersThree size={30} weight="duotone" />
                              <h2>
                                {isNotesTab
                                  ? query.trim() || selectedCourseId !== "all"
                                    ? "No notes found"
                                    : "No notes yet"
                                  : isCommentsTab
                                    ? hasClearableDiscussionFilters
                                      ? "No comments match these filters"
                                      : "No comments yet"
                                    : isMentionsTab
                                      ? hasClearableDiscussionFilters
                                        ? "No mentions match these filters"
                                        : "No mentions yet"
                                      : isFollowingTab
                                        ? query.trim() ||
                                          selectedCourseId !== "all"
                                          ? "No followed discussions found"
                                          : "No followed discussions yet"
                                        : isBookmarksTab
                                          ? query.trim() ||
                                            selectedCourseId !== "all"
                                            ? "No bookmarks found"
                                            : "No bookmarks yet"
                                          : hasClearableDiscussionFilters ||
                                              effectiveOwnership === "mine"
                                            ? "No discussions match these filters"
                                            : "No discussions yet"}
                              </h2>
                              <p>
                                {isNotesTab
                                  ? "Try clearing a filter or choosing another course."
                                  : isCommentsTab
                                    ? hasClearableDiscussionFilters
                                      ? "Try clearing a filter or choosing another course."
                                      : "Comments on lessons will appear here."
                                    : isMentionsTab
                                      ? hasClearableDiscussionFilters
                                        ? "Try clearing a filter or choosing another course."
                                        : "Mentions of you will appear here."
                                      : isFollowingTab
                                        ? "Try clearing a filter or choosing another course."
                                        : isBookmarksTab
                                          ? "Bookmarked discussions and notes will appear here."
                                          : hasClearableDiscussionFilters ||
                                              effectiveOwnership === "mine"
                                            ? "Try clearing a filter or start a new question for the course."
                                            : "Questions asked in your courses will appear here."}
                              </p>
                              {/* Offered only when there is something to clear.
                            With no search, course or status chosen it sat
                            under "match these filters" and did nothing. */}
                              {hasClearableDiscussionFilters ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuery("");
                                    resetDiscussionFilters();
                                  }}
                                >
                                  Clear filters
                                </button>
                              ) : null}
                            </div>
                          )}
                          <div
                            ref={loadMoreRef}
                            className="min-h-px"
                            aria-live="polite"
                          >
                            {isFetchingNextPage && (
                              <div
                                className="grid min-h-12 place-items-center"
                                role="status"
                                aria-label={activeLoadingLabel.replace(
                                  "Loading ",
                                  "Loading more ",
                                )}
                              >
                                <LoadingSpinnerIcon size={18} />
                              </div>
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
                );
              }}
            </SwipeableTabPanel>
          </DiscussionCourseThumbnailsContext.Provider>
        </div>
        {/* Always there, so that a tab with nothing in it, or a closed
          panel on a desktop (its gutter at the frame's edge), does not take
          the panel off the page and put it back when the next tab loads. */}
        {
          <DiscussionWorkspacePanel
            card={panelIsEmpty ? null : panelCard}
            emptyMessage={
              activeTab === "all"
                ? "No discussions to show"
                : `No ${(tabs.find((tab) => tab.id === activeTab)?.label ?? "discussions").toLowerCase()} to show`
            }
            open={Boolean(openPanelCard)}
            onReopen={reopenPanel}
            destination={
              !panelCard || panelIsEmpty
                ? null
                : panelCard.itemType === "note" || panelCard.kind === "note"
                  ? getDiscussionNoteDestination(panelCard)
                  : getDiscussionThreadDestination(panelCard)
            }
            editing={isEditingPanelCard}
            onEditingChange={setIsEditingPanelCard}
            onClose={closePanel}
            onNavigatePage={onNavigatePage}
            courseThumbnail={
              panelCard ? courseThumbnails.get(panelCard.courseId) : undefined
            }
            onReport={openReport}
            setNotice={setNotice}
            step={
              openPanelIndex >= 0
                ? {
                    index: openPanelIndex,
                    count: cards.length,
                    onPrev: () => stepPanel(-1),
                    onNext: () => stepPanel(1),
                  }
                : undefined
            }
          />
        }
        {reportDialog}
      </div>
    </SearchHighlightProvider>
  );
}
