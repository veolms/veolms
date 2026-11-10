import { useEffect, useMemo, useState } from "react";
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
import { WorkshopStatusPanel } from "./WorkshopStatusPanel";
import { WorkshopsAccessDenied } from "./WorkshopsAccessDenied";
import { WORKSHOPS_ADMIN_PATH, workshopEditPath } from "./WorkshopsAdminPage";
import {
  browserTimeZone,
  fieldClass,
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
  saved,
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
      {EDITOR_TABS.filter(() => true).map(([tab, label]) => (
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
    resources: workshop.resources.map((resource) => ({
      key: crypto.randomUUID(),
      ...resource,
    })),
    sessions: workshop.sessions.map(sessionDraftFromAdmin),
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
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultZone));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (
      isEditMode &&
      workshop &&
      loadedFor !== `${workshop.id}:${workshop.updatedAt}`
    ) {
      setForm(formFromWorkshop(workshop));
      setLoadedFor(`${workshop.id}:${workshop.updatedAt}`);
      setIsDirty(false);
    }
  }, [isEditMode, loadedFor, workshop]);

  const patch = (changes: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...changes }));
    setIsDirty(true);
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

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending;

  const slugLocked = Boolean(workshop && workshop.status !== "draft");

  const handleTitleChange = (title: string) => {
    patch({
      title,
      ...(form.slugTouched || slugLocked ? {} : { slug: slugFromTitle(title) }),
    });
  };

  const buildPayload = (): CreateWorkshopRequest | string => {
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
    return {
      title,
      ...(slug ? { slug } : {}),
      summary: form.summary.trim() || null,
      description: form.description.trim() || null,
      coverMediaId: form.cover.coverMediaId,
      coverUrl: form.cover.coverUrl,
      ...(form.hostUserId ? { hostUserId: form.hostUserId } : {}),
      courseId:
        form.access === "course" && form.courseId ? form.courseId : null,
      priceMinor,
      currency: WORKSHOP_DEFAULT_CURRENCY,
      capacity,
      resources,
      sessions,
    };
  };

  const save = async (): Promise<WorkshopAdmin | null> => {
    setErrorMessage(null);
    const payload = buildPayload();
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return null;
    }
    try {
      if (isEditMode && workshop) {
        const update: UpdateWorkshopRequest = {
          ...payload,
          ...(slugLocked ? { slug: undefined } : {}),
        };
        const saved = await updateMutation.mutateAsync({
          workshopId: workshop.id,
          payload: update,
        });
        setIsDirty(false);
        setNotice?.("Workshop saved.");
        return saved;
      }
      const created = await createMutation.mutateAsync(payload);
      setNotice?.("Draft saved. Publish it when the sessions are set.");
      onNavigatePage?.(workshopEditPath(created.id));
      return created;
    } catch (caught) {
      setErrorMessage(getApiError(caught).message);
      return null;
    }
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
            void save();
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
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                    htmlFor="workshop-slug"
                    hint={
                      slugLocked
                        ? "Fixed once published"
                        : "Auto from the title"
                    }
                  >
                    Address
                  </FieldLabel>
                  <div
                    className={`${fieldClass} flex w-full items-center gap-1 text-sm`}
                  >
                    <span className="shrink-0 text-(--muted)">/workshops/</span>
                    <input
                      id="workshop-slug"
                      type="text"
                      value={form.slug}
                      onChange={(event) =>
                        patch({
                          slug: event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, ""),
                          slugTouched: true,
                        })
                      }
                      placeholder="react-performance-day"
                      maxLength={80}
                      disabled={readOnly || slugLocked}
                      className="w-full min-w-0 border-0 bg-transparent outline-none disabled:opacity-60"
                    />
                  </div>
                </div>
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
                  Save the workshop with its sessions first; each session then
                  gets its own recording slot here.
                </p>
              )}
            </Section>
          ) : null}

          {editorTab === "attendance" && !workshop ? (
            <Section
              title="Attendance"
              description="Who joined, who is not going, and who you added."
            >
              <p className="text-sm text-(--muted)">
                Save the draft first; then you can import a spreadsheet or add
                people by email here.
              </p>
            </Section>
          ) : null}
          {editorTab === "attendance" && workshop ? (
            <Section
              title="Attendance"
              description="Who joined, who is not going, and who you added. Download the list or import a spreadsheet."
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
              description="Everyone it is for gets the invitation in their calendar when you publish; nobody registers."
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
                    Free for the course&apos;s learners: they are in without
                    registering and are told when you publish.
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
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-5">
              <Button
                type="button"
                variant="quiet"
                elevation="flat"
                disabled={isBusy}
                onClick={() => onNavigatePage?.(WORKSHOPS_ADMIN_PATH)}
              >
                {isDirty ? "Discard" : "Back"}
              </Button>
              <Button
                type="submit"
                disabled={isBusy || (isEditMode && !isDirty)}
              >
                {isEditMode ? "Save changes" : "Save draft"}
              </Button>
            </div>
          ) : null}
        </form>

        <WorkshopStatusPanel
          workshop={workshop ?? null}
          publishCheck={publishCheck.data}
          preview={{
            title: form.title,
            summary: form.summary,
            coverUrl: form.cover.coverUrl,
            firstSessionAt:
              firstSession?.instants?.startsAt.toISOString() ?? null,
            firstSessionZone: firstSession?.session.timeZone ?? defaultZone,
            priceMinor: previewPriceMinor,
            currency: WORKSHOP_DEFAULT_CURRENCY,
          }}
          isDirty={isDirty}
          isBusy={isBusy}
          canManage={canManage}
          onSave={() => void save()}
          onPublish={(announce) =>
            void run(
              async () => {
                if (!workshop) return;
                await publishMutation.mutateAsync({
                  workshopId: workshop.id,
                  announce,
                });
              },
              workshop?.courseId
                ? "Workshop published. The course's learners are being told."
                : announce
                  ? "Workshop published. Everyone who has signed up is being told."
                  : "Workshop published. Learners can register now.",
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
