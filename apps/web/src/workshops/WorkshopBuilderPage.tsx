import { useMemo, useRef, useState } from "react";
import {
  WORKSHOP_DEFAULT_CURRENCY,
  WORKSHOP_DEFAULT_TIME_ZONE,
  type CreateWorkshopRequest,
  type UpdateWorkshopRequest,
  type WorkshopAdmin,
  type WorkshopSessionInput,
} from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ThemedSelect } from "../ThemedSelect";
import { QuizRichTextField } from "../quizzes/QuizRichTextField";
import { getApiError } from "../lib/api-error";
import {
  removeAutosyncDraft,
  useAutosync,
  type AutosyncKey,
} from "../lib/autosync";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import { useMyCourses } from "../services/courses";
import { useTeamMembers } from "../services/team";
import {
  useCancelWorkshop,
  useCreateWorkshop,
  useDeleteWorkshop,
  usePublishWorkshop,
  useUnpublishWorkshop,
  useUpdateWorkshop,
  useWorkshopAdmin,
  useWorkshopPublishCheck,
} from "../services/workshops";
import { useAuthStore } from "../store/auth.store";
import { WorkshopCoverUpload, type CoverValue } from "./WorkshopCoverUpload";
import {
  WorkshopResourcesField,
  type ResourceDraft,
} from "./WorkshopResourcesField";
import {
  WorkshopSessionsField,
  newSessionDraft,
  sessionDraftFromAdmin,
  sessionDraftInstants,
  type SessionDraft,
} from "./WorkshopSessionsField";
import { WorkshopRecordingField } from "./WorkshopRecordingField";
import { WorkshopRegistrantsSection } from "./WorkshopRegistrantsSection";
import { WorkshopSaveStatus } from "./WorkshopSaveStatus";
import { WorkshopStatusPanel } from "./WorkshopStatusPanel";
import {
  AfterPurchaseWelcomeFields,
  EMPTY_WELCOME_DRAFT,
  welcomeDraftFrom,
  welcomeErrors,
  welcomePayload,
  type WelcomeDraft,
} from "../after-purchase/AfterPurchaseWelcomeFields";
import { WorkshopsAccessDenied } from "./WorkshopsAccessDenied";
import { WORKSHOPS_ADMIN_PATH, workshopEditPath } from "./WorkshopsAdminPage";
import {
  browserTimeZone,
  fieldClass,
  inputClass,
  selectTriggerClass,
  surfaceClass,
} from "./workshopHelpers";

export interface WorkshopBuilderPageProps {
  workshopId?: string | null;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

function RequiredMark() {
  return <span className="text-(--accent)"> *</span>;
}

function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-(--text)"
      >
        {children}
        {required ? <RequiredMark /> : null}
      </label>
      {hint ? <span className="text-[12px] text-(--muted)">{hint}</span> : null}
    </div>
  );
}

type EditorTab =
  "details" | "sessions" | "audience" | "recordings" | "attendance";

const EDITOR_TABS: readonly (readonly [EditorTab, string])[] = [
  ["details", "Details"],
  ["sessions", "Sessions"],
  ["audience", "Audience and price"],
  ["recordings", "Recordings"],
  ["attendance", "Attendance"],
];

/**
 * The editor in tabs: one concern on screen at a time, and the recordings
 * and attendance only load when opened. Those two need a saved workshop.
 */
function EditorTabs({
  value,
  onChange,
}: {
  value: EditorTab;
  onChange: (tab: EditorTab) => void;
  saved: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Workshop editor"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-1 pb-3"
    >
      {EDITOR_TABS.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          onClick={() => onChange(tab)}
          className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
            value === tab
              ? "bg-(--surface-strong) text-(--text)"
              : "text-(--muted) hover:text-(--text)"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-base font-bold tracking-tight text-(--text)">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-(--muted)">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}

interface FormState {
  title: string;
  slug: string;
  slugTouched: boolean;
  summary: string;
  description: string;
  cover: CoverValue;
  hostUserId: string;
  access: "everyone" | "course";
  courseId: string;
  isPaid: boolean;
  priceRupees: string;
  hasCapacity: boolean;
  capacity: string;
  resources: ResourceDraft[];
  sessions: SessionDraft[];
  /** What a buyer reads after paying (order page and email). */
  welcome: WelcomeDraft;
}

function emptyForm(timeZone: string): FormState {
  return {
    title: "",
    slug: "",
    slugTouched: false,
    summary: "",
    description: "",
    cover: { coverMediaId: null, coverUrl: null },
    hostUserId: "",
    // Most workshops are for a course's learners; every learner is a choice.
    access: "course",
    courseId: "",
    isPaid: false,
    priceRupees: "",
    hasCapacity: false,
    capacity: "",
    resources: [],
    sessions: [newSessionDraft(timeZone)],
    welcome: EMPTY_WELCOME_DRAFT,
  };
}

function formFromWorkshop(workshop: WorkshopAdmin): FormState {
  return {
    title: workshop.title,
    slug: workshop.slug,
    slugTouched: true,
    summary: workshop.summary ?? "",
    description: workshop.description ?? "",
    cover: { coverMediaId: workshop.coverMediaId, coverUrl: workshop.coverUrl },
    hostUserId: workshop.host.userId,
    access: workshop.courseId ? "course" : "everyone",
    courseId: workshop.courseId ?? "",
    isPaid: workshop.priceMinor !== null && workshop.priceMinor > 0,
    priceRupees:
      workshop.priceMinor !== null && workshop.priceMinor > 0
        ? String(workshop.priceMinor / 100)
        : "",
    hasCapacity: workshop.capacity !== null,
    capacity: workshop.capacity !== null ? String(workshop.capacity) : "",
    // Keys that do not change between loads, so a refetch after an autosave
    // is not mistaken for an edit.
    resources: workshop.resources.map((resource, index) => ({
      key: `saved-${index}`,
      ...resource,
    })),
    sessions: workshop.sessions.map(sessionDraftFromAdmin),
    welcome: welcomeDraftFrom(workshop.welcome),
  };
}

function sessionsPayload(
  sessions: SessionDraft[],
): WorkshopSessionInput[] | string {
  const payload: WorkshopSessionInput[] = [];
  for (const [index, session] of sessions.entries()) {
    const instants = sessionDraftInstants(session);
    if (!instants) return `Session ${index + 1} needs a start date and time.`;
    const joinUrl = session.joinUrl.trim();
    if (joinUrl && !/^https?:\/\//i.test(joinUrl)) {
      return `Session ${index + 1}: the meeting link must start with https://`;
    }
    payload.push({
      ...(session.id ? { id: session.id } : {}),
      title: session.title.trim() || null,
      startsAt: instants.startsAt.toISOString(),
      endsAt: instants.endsAt.toISOString(),
      timeZone: session.timeZone,
      joinUrl: joinUrl || null,
      passcode: session.passcode.trim() || null,
    });
  }
  return payload;
}

/** The request for a form, or what is missing before it can be saved. */
function buildPayload(form: FormState): CreateWorkshopRequest | string {
  const title = form.title.trim();
  if (title.length < 3)
    return "Give the workshop a title of at least 3 characters.";
  const slug = form.slug.trim();
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "The address may only use lowercase letters, numbers and hyphens.";
  }
  const sessions = sessionsPayload(form.sessions);
  if (typeof sessions === "string") return sessions;
  if (form.access === "course" && !form.courseId) {
    return "Choose the course this workshop is for, or make it for everyone who has signed up.";
  }
  let priceMinor: number | null = null;
  if (form.isPaid && form.access !== "course") {
    const rupees = Number(form.priceRupees);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      return "Enter the price, or switch the workshop back to free.";
    }
    priceMinor = Math.round(rupees * 100);
  }
  let capacity: number | null = null;
  // Seats are only sold; free and course workshops are open to their audience.
  if (form.hasCapacity && form.isPaid && form.access !== "course") {
    const seats = Number(form.capacity);
    if (!Number.isInteger(seats) || seats <= 0) {
      return "Enter how many seats there are, or remove the limit.";
    }
    capacity = seats;
  }
  const resources = form.resources
    .map((resource) => ({
      title: resource.title.trim(),
      url: resource.url.trim(),
    }))
    .filter((resource) => resource.title || resource.url);
  for (const resource of resources) {
    if (!resource.title || !/^https?:\/\//i.test(resource.url)) {
      return "Every link needs a title and an address starting with https://";
    }
  }
  // A browser draft saved before this field existed has none.
  const welcome = form.welcome ?? EMPTY_WELCOME_DRAFT;
  if (Object.keys(welcomeErrors(welcome)).length > 0) {
    return "After purchase: the button needs its words and a link starting with https://";
  }
  return {
    title,
    ...(slug ? { slug } : {}),
    summary: form.summary.trim() || null,
    description: form.description.trim() || null,
    coverMediaId: form.cover.coverMediaId,
    coverUrl: form.cover.coverUrl,
    ...(form.hostUserId ? { hostUserId: form.hostUserId } : {}),
    courseId: form.access === "course" && form.courseId ? form.courseId : null,
    priceMinor,
    currency: WORKSHOP_DEFAULT_CURRENCY,
    capacity,
    resources,
    welcome: welcomePayload(welcome),
    sessions,
  };
}

/** Where an unsaved new workshop waits in this browser. */
const NEW_WORKSHOP_DRAFT: AutosyncKey = {
  entity: "workshop",
  entityId: "new",
  scope: "editor",
};

export function WorkshopBuilderPage({
  workshopId,
  onNavigatePage,
  setNotice,
}: WorkshopBuilderPageProps) {
  const isEditMode = Boolean(workshopId && workshopId !== "create");
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  const user = authUserFetched ? authUser : storeUser;
  const { can } = useCapabilities({ enabled: Boolean(user) });
  const canRead = Boolean(
    user && (can("workshop.read") || can("workshop.manage")),
  );
  const canManage = Boolean(user && can("workshop.manage"));

  const {
    data: workshop,
    isLoading: isLoadingWorkshop,
    error: loadError,
  } = useWorkshopAdmin(isEditMode ? workshopId : null);
  const publishCheck = useWorkshopPublishCheck(isEditMode ? workshopId : null, {
    enabled: isEditMode && workshop?.status === "draft",
  });
  const { data: myCourses } = useMyCourses({ enabled: canRead });
  const team = useTeamMembers("", { enabled: canRead });

  const createMutation = useCreateWorkshop();
  const updateMutation = useUpdateWorkshop();
  const publishMutation = usePublishWorkshop();
  const unpublishMutation = useUnpublishWorkshop();
  const cancelMutation = useCancelWorkshop();
  const [editorTab, setEditorTab] = useState<EditorTab>("details");
  const deleteMutation = useDeleteWorkshop();

  const defaultZone = useMemo(
    () =>
      browserTimeZone() === "UTC"
        ? WORKSHOP_DEFAULT_TIME_ZONE
        : browserTimeZone(),
    [],
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialForm = useMemo(
    () => (workshop ? formFromWorkshop(workshop) : emptyForm(defaultZone)),
    [workshop, defaultZone],
  );
  // A new workshop is created by its first save; later saves update it.
  const createdIdRef = useRef<string | null>(null);
  const slugLocked = Boolean(workshop && workshop.status !== "draft");

  // Every change is kept in this browser at once and sent to the server
  // after a short pause (at the latest within a minute of typing), like
  // the other editors. Nothing to press.
  const autosync = useAutosync<FormState, WorkshopAdmin>({
    key:
      isEditMode && workshopId
        ? { entity: "workshop", entityId: workshopId, scope: "editor" }
        : NEW_WORKSHOP_DRAFT,
    initialValue: initialForm,
    enabled: canManage && (!isEditMode || Boolean(workshop)),
    debounceMs: 1_500,
    maxWaitMs: 60_000,
    validate: (draft) => {
      const payload = buildPayload(draft);
      return typeof payload === "string"
        ? { valid: false, message: payload }
        : true;
    },
    sync: async (draft) => {
      const payload = buildPayload(draft) as CreateWorkshopRequest;
      const id = workshop?.id ?? createdIdRef.current;
      if (id) {
        const update: UpdateWorkshopRequest = {
          ...payload,
          ...(slugLocked ? { slug: undefined } : {}),
        };
        return updateMutation.mutateAsync({ workshopId: id, payload: update });
      }
      const created = await createMutation.mutateAsync(payload);
      createdIdRef.current = created.id;
      removeAutosyncDraft(NEW_WORKSHOP_DRAFT);
      onNavigatePage?.(workshopEditPath(created.id));
      return created;
    },
    onSynced: (saved) => formFromWorkshop(saved),
  });
  const form = autosync.value;

  const patch = (changes: Partial<FormState>) => {
    autosync.update((current) => ({ ...current, ...changes }));
  };

  const courses = useMemo(
    () =>
      (myCourses?.courses ?? []).map(
        (course) => [course.id, course.title] as const,
      ),
    [myCourses?.courses],
  );
  const hosts = useMemo(() => {
    const members = (team.data?.pages ?? []).flatMap((page) => page.members);
    const options = members
      .filter((member) => member.userId)
      .map(
        (member) =>
          [member.userId!, member.name ?? member.email] as readonly [
            string,
            string,
          ],
      );
    if (workshop && !options.some(([id]) => id === workshop.host.userId)) {
      options.unshift([workshop.host.userId, workshop.host.name]);
    }
    if (user && !options.some(([id]) => id === user.id)) {
      options.unshift([user.id, "You"]);
    }
    return options;
  }, [team.data?.pages, user, workshop]);

  // Autosaves are not "busy": the fields stay editable while one is sent.
  const isBusy =
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending;

  const handleTitleChange = (title: string) => {
    patch({
      title,
      ...(form.slugTouched || slugLocked ? {} : { slug: slugFromTitle(title) }),
    });
  };

  const run = async (action: () => Promise<unknown>, notice: string) => {
    setErrorMessage(null);
    try {
      await action();
      setNotice?.(notice);
    } catch (caught) {
      setErrorMessage(getApiError(caught).message);
    }
  };

  if (!isAuthReady || (isEditMode && isLoadingWorkshop)) {
    return (
      <main className="mx-auto w-full max-w-[1320px]">
        <CenteredLoadingSpinner
          label="Loading workshop"
          className="min-h-52 py-24"
        />
      </main>
    );
  }
  if (!canRead || (!isEditMode && !canManage)) {
    return <WorkshopsAccessDenied onNavigatePage={onNavigatePage} />;
  }
  if (isEditMode && !workshop) {
    return (
      <main className="mx-auto grid w-full max-w-[1320px] gap-4">
        <div
          className={`${surfaceClass} grid place-items-center p-10 text-center`}
        >
          <h2 className="text-lg font-semibold">Workshop not found</h2>
          <p className="mt-1 max-w-md text-sm text-(--muted)">
            {loadError?.message || "It may have been deleted."}
          </p>
          <div className="mt-4">
            <Button onClick={() => onNavigatePage?.(WORKSHOPS_ADMIN_PATH)}>
              Back to workshops
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const readOnly = !canManage || isBusy;
  const firstSession = form.sessions
    .map((session) => ({ session, instants: sessionDraftInstants(session) }))
    .filter((item) => item.instants)
    .sort(
      (a, b) => a.instants!.startsAt.getTime() - b.instants!.startsAt.getTime(),
    )[0];
  const previewPriceMinor = form.isPaid
    ? Math.round((Number(form.priceRupees) || 0) * 100)
    : null;

  return (
    <main className="mx-auto grid w-full max-w-[1800px] gap-6">
      <header>
        <button
          type="button"
          onClick={() => onNavigatePage?.(WORKSHOPS_ADMIN_PATH)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-(--muted) hover:text-(--text) cursor-pointer"
        >
          <ArrowLeft size={16} weight="bold" />
          Back to workshops
        </button>
        <h1 className="m-0 text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)">
          {isEditMode ? form.title || "Edit workshop" : "Create workshop"}
        </h1>
        <p className="mt-1.5 mb-0 text-[0.88rem] leading-6 text-(--muted)">
          Set the sessions and meeting links, then publish when it is ready.
        </p>
      </header>

      {errorMessage ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500"
        >
          <WarningCircle size={18} weight="bold" className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void autosync.flush().catch(() => undefined);
          }}
          className={`${surfaceClass} flex min-w-0 flex-col gap-8 p-5 sm:p-6`}
        >
          <EditorTabs
            value={editorTab}
            onChange={setEditorTab}
            saved={Boolean(workshop)}
          />
          {editorTab === "details" ? (
            <Section
              title="Basics"
              description="The title and summary are what learners see first."
            >
              <div className="min-w-0">
                <FieldLabel htmlFor="workshop-title" required>
                  Title
                </FieldLabel>
                <input
                  id="workshop-title"
                  type="text"
                  value={form.title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  placeholder="React performance day"
                  maxLength={160}
                  required
                  disabled={readOnly}
                  className={`${fieldClass} w-full`}
                />
              </div>

              <div className="min-w-0">
                <FieldLabel
                  htmlFor="workshop-summary"
                  required
                  hint={`${form.summary.length}/300`}
                >
                  Summary
                </FieldLabel>
                <input
                  id="workshop-summary"
                  type="text"
                  value={form.summary}
                  onChange={(event) =>
                    patch({ summary: event.target.value.slice(0, 300) })
                  }
                  placeholder="One afternoon on rendering, memoisation and profiling, with a live code review."
                  maxLength={300}
                  disabled={readOnly}
                  className={`${fieldClass} w-full`}
                />
              </div>

              <div className="min-w-0">
                <FieldLabel htmlFor="workshop-description">
                  Description
                </FieldLabel>
                <QuizRichTextField
                  label="Workshop description"
                  value={form.description}
                  onChange={(value) =>
                    patch({ description: value.slice(0, 10_000) })
                  }
                  documentId={`workshop-${workshopId ?? "new"}-description`}
                  placeholder="What you will cover, who it is for, what to prepare."
                  minHeight="min-h-32"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <FieldLabel>Cover image</FieldLabel>
                  <WorkshopCoverUpload
                    value={form.cover}
                    onChange={(cover) => patch({ cover })}
                    disabled={readOnly}
                  />
                </div>
                <div className="grid content-start gap-4">
                  <div className="min-w-0">
                    <FieldLabel htmlFor="workshop-host">Host</FieldLabel>
                    <div className={`${fieldClass} flex w-full items-center`}>
                      <ThemedSelect
                        id="workshop-host"
                        value={form.hostUserId || user?.id || ""}
                        onValueChange={(value) => patch({ hostUserId: value })}
                        options={hosts}
                        searchable={hosts.length > 8}
                        searchPlaceholder="Search the team"
                        disabled={readOnly}
                        ariaLabel="Host"
                        triggerClassName={selectTriggerClass}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          {editorTab === "sessions" ? (
            <Section
              title="Sessions"
              description="Each session has its own time and meeting link. Times are saved in the session's time zone and shown to every learner in theirs."
            >
              <WorkshopSessionsField
                sessions={form.sessions}
                onChange={(sessions) => patch({ sessions })}
                disabled={readOnly}
                defaultTimeZone={defaultZone}
              />
            </Section>
          ) : null}

          {editorTab === "recordings" ? (
            <Section
              title="Recordings"
              description="Upload each session's recording or import it from YouTube, usually after it ends. It goes through the same video processing as lessons; learners are told once it is ready."
            >
              {workshop && workshop.sessions.length > 0 ? (
                <div className="grid gap-3">
                  {workshop.sessions.map((session, index) => (
                    <WorkshopRecordingField
                      key={session.id}
                      workshopId={workshop.id}
                      course={
                        workshop.courseId
                          ? {
                              id: workshop.courseId,
                              title: workshop.courseTitle ?? "the course",
                            }
                          : null
                      }
                      session={session}
                      index={index}
                      disabled={!canManage}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-(--muted)">
                  Each session gets its own recording slot here once the
                  workshop has saved (a title, its course and a session time).
                </p>
              )}
            </Section>
          ) : null}

          {editorTab === "attendance" && !workshop ? (
            <Section
              title="Attendance"
              description="Who joined and who you added."
            >
              <p className="text-sm text-(--muted)">
                Once the workshop has saved (a title, its course and a session
                time), its learners are listed here and you can add more.
              </p>
            </Section>
          ) : null}
          {editorTab === "attendance" && workshop ? (
            <Section
              title="Attendance"
              description="Who joined and who you added."
            >
              <WorkshopRegistrantsSection
                workshop={workshop}
                canManage={canManage}
              />
            </Section>
          ) : null}

          {editorTab === "audience" ? (
            <Section
              title="Audience and price"
              description="Everyone it is for gets the calendar invitation by email when you publish."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="min-w-0">
                    <FieldLabel htmlFor="workshop-access">
                      Who it&apos;s for
                    </FieldLabel>
                    <div className={`${fieldClass} flex w-full items-center`}>
                      <ThemedSelect
                        id="workshop-access"
                        value={form.access}
                        onValueChange={(value) =>
                          patch({ access: value as FormState["access"] })
                        }
                        options={[
                          ["course", "Learners of one course"],
                          ["everyone", "Everyone who has signed up"],
                        ]}
                        disabled={readOnly}
                        ariaLabel="Who it's for"
                        triggerClassName={selectTriggerClass}
                      />
                    </div>
                    {form.access === "course" ? (
                      <div
                        className={`${fieldClass} mt-2 flex w-full items-center`}
                      >
                        <ThemedSelect
                          id="workshop-course"
                          value={form.courseId}
                          onValueChange={(value) => patch({ courseId: value })}
                          options={courses}
                          searchable
                          searchPlaceholder="Search courses"
                          defaultLimit={6}
                          disabled={readOnly || courses.length === 0}
                          ariaLabel="Course"
                          triggerClassName={selectTriggerClass}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                {form.access === "course" ? (
                  <p className="rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5 text-[13px] leading-5 text-(--muted)">
                    Free for the course&apos;s learners. They are told by email,
                    with the calendar invitation, when you publish.
                  </p>
                ) : (
                  <div className="grid gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-(--text)">
                        Paid workshop
                      </span>
                      <ToggleSwitch
                        checked={form.isPaid}
                        onChange={(isPaid) => patch({ isPaid })}
                        label="Paid workshop"
                        disabled={readOnly}
                      />
                    </div>
                    {form.isPaid ? (
                      <div
                        className={`${fieldClass} flex w-full items-center gap-2`}
                      >
                        <span className="text-sm font-semibold text-(--muted)">
                          ₹
                        </span>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={form.priceRupees}
                          onChange={(event) =>
                            patch({ priceRupees: event.target.value })
                          }
                          placeholder="499"
                          disabled={readOnly}
                          aria-label="Price in rupees"
                          className="w-full border-0 bg-transparent outline-none"
                        />
                      </div>
                    ) : (
                      <p className="text-[12px] text-(--muted)">
                        Free: everyone who has signed up is in and gets the
                        invitation.
                      </p>
                    )}
                  </div>
                )}
                {form.isPaid && form.access !== "course" ? (
                  <div className="grid gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-(--text)">
                        Limit seats
                      </span>
                      <ToggleSwitch
                        checked={form.hasCapacity}
                        onChange={(hasCapacity) => patch({ hasCapacity })}
                        label="Limit seats"
                        disabled={readOnly}
                      />
                    </div>
                    {form.hasCapacity ? (
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={form.capacity}
                        onChange={(event) =>
                          patch({ capacity: event.target.value })
                        }
                        placeholder="100"
                        disabled={readOnly}
                        aria-label="Number of seats"
                        className={`${fieldClass} w-full`}
                      />
                    ) : (
                      <p className="text-[12px] text-(--muted)">
                        Unlimited seats.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {editorTab === "audience" &&
          form.isPaid &&
          form.access !== "course" ? (
            <Section
              title="After purchase"
              description="A welcome buyers read on their order page and in the confirmation email, right after paying. Add a button for your WhatsApp or Telegram group."
            >
              <AfterPurchaseWelcomeFields
                idPrefix="workshop-welcome"
                messagePlaceholder="Hi {first_name}, you have your seat! Join our WhatsApp group for updates before the session."
                value={form.welcome ?? EMPTY_WELCOME_DRAFT}
                onChange={(welcome) => patch({ welcome })}
                disabled={readOnly}
                inputClassName={`${fieldClass} w-full aria-[invalid=true]:border-rose-500`}
                textareaClassName={`${inputClass} h-auto! min-h-[104px] w-full resize-y py-2.5 pb-7 aria-[invalid=true]:border-rose-500`}
              />
            </Section>
          ) : null}

          {editorTab === "details" ? (
            <Section
              title="Resources"
              description="Links learners see on the workshop page: slides, a repository, reading."
            >
              <WorkshopResourcesField
                resources={form.resources}
                onChange={(resources) => patch({ resources })}
                disabled={readOnly}
              />
            </Section>
          ) : null}

          {canManage ? (
            <div className="relative flex min-h-10 items-center border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4">
              <Button
                type="button"
                variant="quiet"
                elevation="flat"
                onClick={() => onNavigatePage?.(WORKSHOPS_ADMIN_PATH)}
              >
                Back
              </Button>
              <div className="pointer-events-none absolute inset-x-24 top-4 flex justify-center">
                <WorkshopSaveStatus
                  status={autosync.status}
                  error={autosync.error}
                />
              </div>
            </div>
          ) : null}
        </form>

        <WorkshopStatusPanel
          workshop={workshop ?? null}
          publishCheck={publishCheck.data}
          isBusy={isBusy}
          canManage={canManage}
          onPublish={(announce) =>
            void run(
              async () => {
                if (!workshop) return;
                await autosync.flush();
                await publishMutation.mutateAsync({
                  workshopId: workshop.id,
                  announce,
                });
              },
              workshop?.courseId
                ? "Workshop published. The course's learners are being told."
                : announce
                  ? "Workshop published. Everyone who has signed up is being told."
                  : "Workshop published. Learners can see it now.",
            )
          }
          onUnpublish={() =>
            void run(async () => {
              if (!workshop) return;
              await unpublishMutation.mutateAsync(workshop.id);
            }, "Workshop unpublished. It is a draft again.")
          }
          onCancel={(reason, refundPaid) =>
            void run(
              async () => {
                if (!workshop) return;
                await cancelMutation.mutateAsync({
                  workshopId: workshop.id,
                  payload: { reason, refundPaid },
                });
              },
              refundPaid
                ? "Workshop cancelled. Refunds are on their way."
                : "Workshop cancelled.",
            )
          }
          onDelete={() =>
            void run(async () => {
              if (!workshop) return;
              await deleteMutation.mutateAsync(workshop.id);
              onNavigatePage?.(WORKSHOPS_ADMIN_PATH);
            }, "Workshop deleted.")
          }
        />
      </div>
    </main>
  );
}
