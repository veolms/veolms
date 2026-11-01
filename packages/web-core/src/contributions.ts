import type { ComponentType } from "react";

/**
 * Runtime UI contributions: small pieces of interface a plugin adds to core
 * screens without core knowing what the plugin is. A plugin registers them
 * once in the browser (for example from its root layout module); the core
 * screen that owns the slot renders whatever is registered, in `order`.
 *
 * Routes are contributed at build time through `WebExtension`; these are
 * contributed at runtime because they are components, not route files.
 */

/** What a lesson-card action knows about the lesson it sits on. */
export interface LessonCardActionProps {
  /** Course slug (or id) the curriculum belongs to. */
  courseKey: string;
  lessonNumber: number;
  /** The number the lesson is shown with in the list. */
  displayNumber: number;
  lessonTitle: string;
  /** Lesson content type ("video", "quiz", "document", …). */
  contentType: string;
  isActive: boolean;
  /**
   * Shape shared by the lesson card's own action buttons, so a contributed
   * button lines up with them. The contribution adds its own tint.
   */
  actionClassName: string;
}

export interface LessonCardActionContribution {
  id: string;
  order?: number;
  component: ComponentType<LessonCardActionProps>;
}

export interface ProfileMenuIconProps {
  size?: number;
  className?: string;
}

/** A link added to the account section of the profile menu. */
export interface ProfileMenuLinkContribution {
  id: string;
  label: string;
  href: string;
  order?: number;
  icon?: ComponentType<ProfileMenuIconProps>;
  /** Workspace roles the link is shown for; all roles when omitted. */
  roles?: readonly string[];
  /**
   * Shown to admins only when true. A workspace role cannot say this: the
   * "creator" workspace is an instructor's too.
   */
  adminOnly?: boolean;
}

/**
 * A page a plugin shows inside the academy shell (see `shellRoutes` on
 * `WebExtension`). The shell uses this for its title and description.
 */
export interface ShellPageContribution {
  /** The route id the page's route was declared with. */
  routeId: string;
  title: string;
  description: string;
}

/**
 * Data a plugin can give core when the network is unreachable, so pages
 * work offline for what the plugin kept (for example downloaded lessons).
 * Each method returns the same data the API endpoint would, or `null`
 * when it has nothing; core asks only after a request failed for lack of a
 * network, never instead of the API.
 */
export interface OfflineDataProvider {
  /** `GET /auth/me` */
  currentUser(): Promise<unknown>;
  /** `GET /courses/:idOrSlug/overview` */
  courseOverview(idOrSlug: string): Promise<unknown>;
  /** `GET /courses/:courseSlug/lessons/:lessonNumber/playback-bootstrap` */
  playbackBootstrap(courseSlug: string, lessonNumber: number): Promise<unknown>;
}

/** The filter the analytics page passes to every tab. */
export interface AnalyticsTabFilters {
  /** ISO instants; the range the page shows. */
  from: string;
  to: string;
  /** One course, or every course the viewer may see when absent. */
  courseId?: string;
  /** The range's preset, for a tab that wants to label it. */
  /** A preset, or "custom" for dates the person picked (see from/to). */
  rangeKey: "1d" | "7d" | "30d" | "3m" | "1y" | "custom";
}

/** One table of a tab, as a CSV export wants it. */
export interface AnalyticsExportSection {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

/** One tile of a section's loading state: its label, drawn before its number. */
export interface AnalyticsPlaceholderKpi {
  label: string;
  tone?:
    | "accent"
    | "violet"
    | "blue"
    | "emerald"
    | "amber"
    | "teal"
    | "rose"
    | "pink"
    | "slate";
  Icon?: ComponentType<{ size?: number; weight?: "bold" | "regular" }>;
}

/** One card of a section's loading state: its title, with a shimmer inside. */
export interface AnalyticsPlaceholderSection {
  title: string;
  description?: string;
  kind: "chart" | "list" | "table";
  /** Half-width cards sit two to a row; the default is the full width. */
  span?: "full" | "half";
  /** A chart's height, a list's or table's row count. */
  size?: number;
}

/**
 * What a section looks like before its numbers are in, so the page can
 * draw its real tiles and cards at once and fill them as data arrives.
 */
export interface AnalyticsTabPlaceholderSpec {
  kpis: ReadonlyArray<AnalyticsPlaceholderKpi>;
  sections: ReadonlyArray<AnalyticsPlaceholderSection>;
}

export interface AnalyticsTabProps {
  filters: AnalyticsTabFilters;
  /** The viewer sees the whole academy (admin), or their own courses. */
  isAdmin: boolean;
  /**
   * Hands the page what the tab would export. Called with the tab's
   * tables once they are loaded, and with `null` while they are not.
   */
  onExportChange: (sections: AnalyticsExportSection[] | null) => void;
}

/**
 * A tab a plugin adds to the analytics page beside Overview, Revenue and
 * Courses. The page renders the tab's component with the shared filters
 * when it is selected.
 */
export interface AnalyticsTabContribution {
  /** The `?tab=` value; letters, digits and dashes. */
  id: string;
  label: string;
  order?: number;
  /** Drawn as the Settings page draws its tab icons (a Phosphor icon fits). */
  Icon: ComponentType<{
    size?: number;
    weight?: "duotone" | "fill" | "regular";
  }>;
  /** The tab's colour when page tabs are multicolour, as on Settings. */
  tone: "blue" | "cyan" | "gold" | "green" | "orange" | "rose" | "violet";
  component: ComponentType<AnalyticsTabProps>;
  /** Shown to admins only when true (an instructor never sees it). */
  adminOnly?: boolean;
  /**
   * The permission key that opens the tab (a role editor tick), in place
   * of `adminOnly`: whoever holds it sees the tab.
   */
  permission?: string;
  /** Drawn while the section's code and data load; grey blocks without it. */
  placeholder?: AnalyticsTabPlaceholderSpec;
}

/** What the course editor hands a section a plugin added to it. */
export interface CourseEditorSectionProps {
  courseId: string;
  courseSlug: string;
  /** Shows a short message as the editor's own notices. */
  notify(message: string): void;
}

/**
 * A section a plugin adds to a step of the course editor, drawn after the
 * step's own cards. It saves its own settings, as the editor's cards do
 * (each change at once, with its own saving / saved state).
 */
export interface CourseEditorSectionContribution {
  id: string;
  order?: number;
  /** The editor step whose panel the section is drawn in. */
  step: "access-rules" | "extras";
  component: ComponentType<CourseEditorSectionProps>;
  /** Drawn for admins only when true (an instructor never sees it). */
  adminOnly?: boolean;
}

export interface WebContributions {
  lessonCardActions: readonly LessonCardActionContribution[];
  profileMenuLinks: readonly ProfileMenuLinkContribution[];
  analyticsTabs: readonly AnalyticsTabContribution[];
  courseEditorSections: readonly CourseEditorSectionContribution[];
}

/**
 * Something a visitor did, as core reports it. Core names the moments
 * (a page opened, a course page opened, the enrol button pressed, a
 * checkout started and its steps, how a payment ended); what is done with
 * them is the sink's business. Nothing is recorded when no sink is
 * registered, and nothing here identifies the visitor: the sink adds that.
 */
export interface AnalyticsEvent {
  name:
    | "page_view"
    | "course_view"
    | "enroll_click"
    | "checkout_start"
    | "checkout_step"
    | "payment_result"
    /** The server verified a payment; `props.item` is "course" or "quiz". */
    | "payment_confirmed"
    /** Access granted; `props.kind` is "free" or "paid". */
    | "enrollment_completed"
    | "coupon_applied"
    | "coupon_rejected"
    | "signup_completed"
    /** `props.method`: "otp", "password", "google", "oauth" or "passkey". */
    | "login_completed"
    | "quiz_started"
    /** `props.passed`. */
    | "quiz_submitted"
    | "lesson_video_completed"
    /** `props.has_results`; the search text itself is never reported. */
    | "catalog_search"
    | (string & {});
  /** ISO instant. */
  at: string;
  /** Path and query of the page the event happened on. */
  path: string;
  courseId?: string;
  orderId?: string;
  /** For checkout_step: which step. */
  step?: string;
  /** For payment_result and some steps: how it ended. */
  outcome?: string;
  /** For page_view: where the visitor came from, the first page only. */
  referrer?: string;
  /** For page_view: utm_* parameters of the page's address. */
  utm?: Record<string, string>;
  props?: Record<string, string | number | boolean>;
}

/** One playback of a lesson video, summarised when it ends. */
export interface PlaybackSummary {
  /** Random id for this playback. */
  playbackId: string;
  /** The course's route key (slug or id), as the progress heartbeat uses. */
  courseKey: string;
  /** The lesson's number in the course, when the player knows it. */
  lessonNumber: number | null;
  /** The player's key for the media (the resume key or file name). */
  mediaKey: string;
  startedAt: string;
  endedAt: string;
  /** Milliseconds from the load starting to the first frame playing. */
  startupMs: number | null;
  /** The video never reached its first frame. */
  startFailed: boolean;
  errorCode?: string;
  /** Rebuffering after the first frame: how often and for how long. */
  bufferingCount: number;
  bufferingMs: number;
  /** Seconds of video actually played. */
  watchedSeconds: number;
  /** Seconds played at each rendition height. */
  qualities: Array<{ height: number; seconds: number }>;
}

/**
 * Who is signed in, as far as analytics needs to know: the account id and
 * its roles. `null` means a guest. The sink decides what, if anything, of
 * this leaves the browser.
 */
export interface AnalyticsVisitor {
  id: string;
  roles: string[];
}

/** Where core hands its events; one sink at a time. */
export interface AnalyticsSink {
  track(event: AnalyticsEvent): void;
  playback(summary: PlaybackSummary): void;
  /**
   * Called once the session is known and again on every sign-in or
   * sign-out. A sink registered later gets the current visitor at once.
   */
  identify?(visitor: AnalyticsVisitor | null): void;
}

type Listener = () => void;

interface ContributionStore {
  snapshot: WebContributions;
  listeners: Set<Listener>;
  shellPages?: Map<string, ShellPageContribution>;
  offlineData?: OfflineDataProvider | null;
  analyticsSink?: AnalyticsSink | null;
  /** Unset until the session is known; `null` is a guest. */
  analyticsVisitor?: AnalyticsVisitor | null;
}

// One store per page, shared even when the module is bundled twice (core
// and a plugin can end up with separate copies in development).
const STORE_KEY = Symbol.for("veolms.web-core.contributions");

function getStore(): ContributionStore {
  const host = globalThis as typeof globalThis & {
    [STORE_KEY]?: ContributionStore;
  };
  host[STORE_KEY] ??= {
    snapshot: {
      lessonCardActions: [],
      profileMenuLinks: [],
      analyticsTabs: [],
      courseEditorSections: [],
    },
    listeners: new Set(),
  };
  return host[STORE_KEY];
}

function byOrder<T extends { order?: number }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function update(next: Partial<WebContributions>): void {
  const store = getStore();
  store.snapshot = { ...store.snapshot, ...next };
  for (const listener of store.listeners) listener();
}

/**
 * Adds (or replaces, by id) an action button on every lesson card.
 * Returns a function that removes it again.
 */
export function registerLessonCardAction(
  contribution: LessonCardActionContribution,
): () => void {
  const others = getStore().snapshot.lessonCardActions.filter(
    (entry) => entry.id !== contribution.id,
  );
  update({ lessonCardActions: [...others, contribution].sort(byOrder) });
  return () =>
    update({
      lessonCardActions: getStore().snapshot.lessonCardActions.filter(
        (entry) => entry !== contribution,
      ),
    });
}

/**
 * Adds (or replaces, by id) a link in the profile menu's account section.
 * Returns a function that removes it again.
 */
export function registerProfileMenuLink(
  contribution: ProfileMenuLinkContribution,
): () => void {
  const others = getStore().snapshot.profileMenuLinks.filter(
    (entry) => entry.id !== contribution.id,
  );
  update({ profileMenuLinks: [...others, contribution].sort(byOrder) });
  return () =>
    update({
      profileMenuLinks: getStore().snapshot.profileMenuLinks.filter(
        (entry) => entry !== contribution,
      ),
    });
}

/**
 * Adds (or replaces, by id) a tab on the analytics page.
 * Returns a function that removes it again.
 */
export function registerAnalyticsTab(
  contribution: AnalyticsTabContribution,
): () => void {
  const others = getStore().snapshot.analyticsTabs.filter(
    (entry) => entry.id !== contribution.id,
  );
  update({ analyticsTabs: [...others, contribution].sort(byOrder) });
  return () =>
    update({
      analyticsTabs: getStore().snapshot.analyticsTabs.filter(
        (entry) => entry !== contribution,
      ),
    });
}

/**
 * Adds (or replaces, by id) a section to a step of the course editor.
 * Returns a function that removes it again.
 */
export function registerCourseEditorSection(
  contribution: CourseEditorSectionContribution,
): () => void {
  const others = getStore().snapshot.courseEditorSections.filter(
    (entry) => entry.id !== contribution.id,
  );
  update({ courseEditorSections: [...others, contribution].sort(byOrder) });
  return () =>
    update({
      courseEditorSections: getStore().snapshot.courseEditorSections.filter(
        (entry) => entry !== contribution,
      ),
    });
}

/** Current contributions; the same object until something changes. */
export function getWebContributions(): WebContributions {
  return getStore().snapshot;
}

/** For `useSyncExternalStore`: calls `listener` whenever contributions change. */
export function subscribeWebContributions(listener: Listener): () => void {
  const { listeners } = getStore();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers the title of a plugin page shown inside the shell. */
export function registerShellPage(page: ShellPageContribution): () => void {
  const store = getStore();
  store.shellPages ??= new Map();
  store.shellPages.set(page.routeId, page);
  return () => {
    if (store.shellPages?.get(page.routeId) === page) {
      store.shellPages.delete(page.routeId);
    }
  };
}

export function getShellPage(
  routeId: string,
): ShellPageContribution | undefined {
  return getStore().shellPages?.get(routeId);
}

/** Sets the provider core asks for data when offline (one at a time). */
export function registerOfflineDataProvider(
  provider: OfflineDataProvider,
): () => void {
  const store = getStore();
  store.offlineData = provider;
  return () => {
    if (store.offlineData === provider) store.offlineData = null;
  };
}

export function getOfflineDataProvider(): OfflineDataProvider | null {
  return getStore().offlineData ?? null;
}

/** Sets the sink core's analytics events go to (one at a time). */
export function registerAnalyticsSink(sink: AnalyticsSink): () => void {
  const store = getStore();
  store.analyticsSink = sink;
  if (store.analyticsVisitor !== undefined) {
    sink.identify?.(store.analyticsVisitor);
  }
  return () => {
    if (store.analyticsSink === sink) store.analyticsSink = null;
  };
}

export function getAnalyticsSink(): AnalyticsSink | null {
  return getStore().analyticsSink ?? null;
}

/** Core reports the signed-in visitor here; see `AnalyticsSink.identify`. */
export function reportAnalyticsVisitor(visitor: AnalyticsVisitor | null): void {
  const store = getStore();
  store.analyticsVisitor = visitor;
  store.analyticsSink?.identify?.(visitor);
}
