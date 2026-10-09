import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { HomePageSettings } from "@veolms/contracts";
import { DEFAULT_HOME_PAGE_SETTINGS } from "@veolms/contracts/home-page-defaults";
import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { PageHeading } from "../components/PageHeading";
import { getApiError } from "../lib/api-error";
import type { NavigateTo } from "../routing/navigation";
import {
  useHomePageSettings,
  useHomePageSettingsOptions,
  useUpdateHomePageSettings,
} from "../services/home";
import { CourseSectionEditor } from "./CourseSectionEditor";
import { DiscussionsEditor } from "./DiscussionsEditor";
import {
  SettingsSection,
  TextField,
  surfaceClass,
} from "./homePageSettingsControls";

const pageClass = "mx-auto grid w-full max-w-[1100px] gap-5";

/** Why the settings cannot be saved yet, or null when they can. */
function getBlockingProblem(settings: HomePageSettings): string | null {
  const required: [string, string][] = [
    ["Hero headline", settings.hero.headline],
    ["Main button label", settings.hero.primaryActionLabel],
    ["Popular courses heading", settings.popularCourses.title],
    ["Free courses heading", settings.freeCourses.title],
    ["Discussions heading", settings.discussions.title],
    ...settings.highlights.items.map((item, index): [string, string] => [
      `Highlight ${index + 1} title`,
      item.title,
    ]),
  ];
  const missing = required.find(([, value]) => value.trim().length === 0);
  if (missing) return `${missing[0]} is required.`;

  for (const [name, section] of [
    ["Popular courses", settings.popularCourses],
    ["Free courses", settings.freeCourses],
  ] as const) {
    if (section.selection === "manual" && section.courseIds.length === 0) {
      return `${name}: choose at least one course, or switch to automatic.`;
    }
  }
  return null;
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function HomePageSettingsForm({
  saved,
  savedAt,
  setNotice,
}: {
  saved: HomePageSettings;
  savedAt: string | null;
  setNotice?: (message: string) => void;
}) {
  const [draft, setDraft] = useState(saved);
  const optionsQuery = useHomePageSettingsOptions();
  const updateSettings = useUpdateHomePageSettings();

  const courses = optionsQuery.data?.courses ?? [];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const problem = getBlockingProblem(draft);
  const saveError = updateSettings.isError
    ? getApiError(updateSettings.error).message
    : null;

  const update = <Key extends keyof HomePageSettings>(
    key: Key,
    value: HomePageSettings[Key],
  ) => {
    updateSettings.reset();
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem || updateSettings.isPending) return;
    updateSettings.mutate(draft, {
      onSuccess: () => setNotice?.("Home page saved."),
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <SettingsSection
        id="home-page-hero-heading"
        title="Hero"
        description="The banner at the top of the page, over the hero picture."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="home-page-hero-headline"
            label="Headline"
            value={draft.hero.headline}
            onChange={(headline) => update("hero", { ...draft.hero, headline })}
            maxLength={60}
            required
          />
          <TextField
            id="home-page-hero-highlighted"
            label="Second line (accent colour)"
            value={draft.hero.highlightedHeadline}
            onChange={(highlightedHeadline) =>
              update("hero", { ...draft.hero, highlightedHeadline })
            }
            maxLength={60}
            hint="Leave empty for a one-line headline."
          />
        </div>
        <TextField
          id="home-page-hero-description"
          label="Supporting text"
          value={draft.hero.description}
          onChange={(description) =>
            update("hero", { ...draft.hero, description })
          }
          maxLength={240}
          multiline
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="home-page-hero-primary"
            label="Main button label"
            value={draft.hero.primaryActionLabel}
            onChange={(primaryActionLabel) =>
              update("hero", { ...draft.hero, primaryActionLabel })
            }
            maxLength={30}
            required
            hint="Opens the course catalogue."
          />
          <TextField
            id="home-page-hero-secondary"
            label="Second button label"
            value={draft.hero.secondaryActionLabel}
            onChange={(secondaryActionLabel) =>
              update("hero", { ...draft.hero, secondaryActionLabel })
            }
            maxLength={30}
            hint="Scrolls to the free courses. Leave empty to remove the button."
          />
        </div>
      </SettingsSection>

      <SettingsSection
        id="home-page-highlights-heading"
        title="Highlight cards"
        description="The four cards above the student comments. Each keeps its icon and colour."
        visible={draft.highlights.visible}
        onVisibleChange={(visible) =>
          update("highlights", { ...draft.highlights, visible })
        }
      >
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          {draft.highlights.items.map((item, index) => {
            const setItem = (next: typeof item) =>
              update("highlights", {
                ...draft.highlights,
                items: draft.highlights.items.map((current, position) =>
                  position === index ? next : current,
                ),
              });
            return (
              <fieldset key={index} className="grid min-w-0 gap-3">
                <legend className="mb-2 text-xs font-semibold tracking-wide text-(--muted) uppercase">
                  Card {index + 1}
                </legend>
                <TextField
                  id={`home-page-highlight-${index}-title`}
                  label="Title"
                  value={item.title}
                  onChange={(title) => setItem({ ...item, title })}
                  maxLength={30}
                  required
                />
                <TextField
                  id={`home-page-highlight-${index}-description`}
                  label="Description"
                  value={item.description}
                  onChange={(description) => setItem({ ...item, description })}
                  maxLength={60}
                />
              </fieldset>
            );
          })}
        </div>
      </SettingsSection>

      <CourseSectionEditor
        id="home-page-popular"
        name="Popular courses"
        description="The first row of courses."
        automaticDescription="The courses with the most enrolments."
        section={draft.popularCourses}
        onChange={(section) => update("popularCourses", section)}
        courses={courses}
        optionsLoading={optionsQuery.isLoading}
      />

      <CourseSectionEditor
        id="home-page-free"
        name="Free courses"
        description="The second row. Only free courses can appear here."
        automaticDescription="The most enrolled free courses, avoiding repeats of the first row."
        section={draft.freeCourses}
        onChange={(section) => update("freeCourses", section)}
        courses={courses.filter((course) => course.isFree)}
        optionsLoading={optionsQuery.isLoading}
      />

      <DiscussionsEditor
        section={draft.discussions}
        onChange={(section) => update("discussions", section)}
        discussions={optionsQuery.data?.discussions ?? []}
        optionsLoading={optionsQuery.isLoading}
      />

      {optionsQuery.isError ? (
        <p className="text-sm text-(--muted)" role="status">
          Courses and discussions to choose from could not be loaded. The text
          settings can still be saved.
        </p>
      ) : null}

      <div
        className={`${surfaceClass} sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3.5`}
      >
        <p
          className={`flex min-w-0 items-center gap-2 text-sm ${
            saveError || (isDirty && problem)
              ? "text-rose-500"
              : "text-(--muted)"
          }`}
          role="status"
          aria-live="polite"
        >
          {saveError || (isDirty && problem) ? (
            <WarningCircle size={17} weight="bold" className="shrink-0" />
          ) : null}
          <span>
            {saveError ??
              (isDirty
                ? (problem ?? "You have unsaved changes.")
                : savedAt
                  ? `Saved ${formatSavedAt(savedAt)}. Visitors see it on their next visit.`
                  : "The home page is using the default content.")}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="h-10 cursor-pointer rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-45"
            disabled={
              JSON.stringify(draft) ===
              JSON.stringify(DEFAULT_HOME_PAGE_SETTINGS)
            }
            onClick={() => {
              updateSettings.reset();
              setDraft(DEFAULT_HOME_PAGE_SETTINGS);
            }}
          >
            Reset to defaults
          </button>
          {isDirty ? (
            <button
              type="button"
              className="h-10 cursor-pointer rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              onClick={() => {
                updateSettings.reset();
                setDraft(saved);
              }}
            >
              Discard
            </button>
          ) : null}
          <Button
            type="submit"
            motion="static"
            disabled={!isDirty || Boolean(problem) || updateSettings.isPending}
          >
            {updateSettings.isPending ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : null}
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

function AccessDenied({ onNavigatePage }: { onNavigatePage?: NavigateTo }) {
  return (
    <main className={pageClass}>
      <div
        className={`${surfaceClass} grid place-items-center p-10 text-center`}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <ShieldWarning size={24} weight="bold" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
        <p className="mt-1 max-w-md text-sm text-(--muted)">
          The home page can only be changed by academy administrators.
        </p>
        <div className="mt-4">
          <Button onClick={() => onNavigatePage?.("/")}>Return home</Button>
        </div>
      </div>
    </main>
  );
}

/**
 * Where an academy admin configures the home page that signed-out visitors
 * see: the hero copy, the highlight cards, the two course rows and the
 * discussion list.
 */
export function HomePageSettingsPage({
  canManage,
  onNavigatePage,
  setNotice,
}: {
  /** Only administrators may open this page; the API enforces it as well. */
  canManage: boolean;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}) {
  if (!canManage) return <AccessDenied onNavigatePage={onNavigatePage} />;
  return <HomePageSettingsEditor setNotice={setNotice} />;
}

function HomePageSettingsEditor({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const settingsQuery = useHomePageSettings();

  return (
    <main className={pageClass} aria-labelledby="home-page-settings-title">
      <PageHeading
        id="home-page-settings-title"
        title="Home Page"
        description="Choose what signed-out visitors see on the home page. To check the result, open the site in a private window."
      />

      {settingsQuery.isLoading ? (
        <CenteredLoadingSpinner
          label="Loading home page settings"
          className="min-h-52 py-24"
        />
      ) : settingsQuery.isError || !settingsQuery.data ? (
        <div
          role="alert"
          className={`${surfaceClass} grid place-items-center gap-3 p-10 text-center`}
        >
          <p className="text-sm font-semibold text-(--text)">
            The home page settings could not be loaded.
          </p>
          <Button onClick={() => void settingsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <HomePageSettingsForm
          // A save replaces the saved copy; start the draft from it again.
          key={settingsQuery.data.updatedAt ?? "default"}
          saved={settingsQuery.data.settings}
          savedAt={settingsQuery.data.updatedAt}
          setNotice={setNotice}
        />
      )}
    </main>
  );
}
