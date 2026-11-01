import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { XIcon as X } from "@phosphor-icons/react/X";
import type {
  HomePageCourseOption,
  HomePageCourseSection,
} from "@veolms/contracts";
import { HOME_PAGE_MAX_SELECTED_COURSES } from "@veolms/contracts/home-page-defaults";
import { ThemedSelect } from "../ThemedSelect";
import {
  SettingsSection,
  TextField,
  fieldClass,
  insetRowClass,
} from "./homePageSettingsControls";

const iconButtonClass =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";

/**
 * A course row on the home page: its heading, and whether the courses are
 * ranked automatically or picked and ordered by hand.
 */
export function CourseSectionEditor({
  id,
  name,
  description,
  automaticDescription,
  section,
  onChange,
  courses,
  optionsLoading,
}: {
  id: string;
  name: string;
  description: string;
  /** What "automatic" means for this row. */
  automaticDescription: string;
  section: HomePageCourseSection;
  onChange: (section: HomePageCourseSection) => void;
  /** The courses this row may show. */
  courses: readonly HomePageCourseOption[];
  optionsLoading: boolean;
}) {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const isManual = section.selection === "manual";
  const isFull = section.courseIds.length >= HOME_PAGE_MAX_SELECTED_COURSES;
  const availableOptions = courses
    .filter((course) => !section.courseIds.includes(course.id))
    .map((course) => [course.id, course.title] as const);

  const setCourseIds = (courseIds: string[]) =>
    onChange({ ...section, courseIds });
  const move = (index: number, offset: -1 | 1) => {
    const next = [...section.courseIds];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(index + offset, 0, moved);
    setCourseIds(next);
  };

  return (
    <SettingsSection
      id={`${id}-heading`}
      title={name}
      description={description}
      visible={section.visible}
      onVisibleChange={(visible) => onChange({ ...section, visible })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${id}-title`}
          label="Heading"
          value={section.title}
          onChange={(title) => onChange({ ...section, title })}
          maxLength={40}
          required
        />
        <TextField
          id={`${id}-subtitle`}
          label="Supporting line"
          value={section.subtitle}
          onChange={(subtitle) => onChange({ ...section, subtitle })}
          maxLength={120}
        />
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[13px] font-medium text-(--text)">
          Courses shown
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(
            [
              ["automatic", "Automatic", automaticDescription],
              [
                "manual",
                "Choose courses",
                `Pick up to ${HOME_PAGE_MAX_SELECTED_COURSES} courses and set their order.`,
              ],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 p-3.5 ${insetRowClass} ${
                section.selection === value
                  ? "border-(--accent)! ring-2 ring-(--accent)/20"
                  : ""
              }`}
            >
              <input
                type="radio"
                name={`${id}-selection`}
                value={value}
                checked={section.selection === value}
                onChange={() => onChange({ ...section, selection: value })}
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-(--text)">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-(--muted)">
                  {help}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isManual ? (
        <div className="min-w-0">
          <div className={`${fieldClass} flex h-11 items-center`}>
            <ThemedSelect
              id={`${id}-add-course`}
              value=""
              onValueChange={(courseId) => {
                if (courseId) setCourseIds([...section.courseIds, courseId]);
              }}
              options={availableOptions}
              searchable
              searchPlaceholder="Search courses..."
              defaultLimit={6}
              disabled={isFull || availableOptions.length === 0}
              ariaLabel={`Add a course to ${name}`}
              className="w-full"
              triggerClassName="h-11! p-0! bg-transparent! shadow-none! border-0! text-sm font-medium hover:bg-transparent! flex w-full items-center justify-between"
            />
          </div>
          <p className="mt-1.5 text-xs text-(--muted)">
            {isFull
              ? `The row is full. Remove a course to add another.`
              : optionsLoading
                ? "Loading courses..."
                : `Add a course. ${section.courseIds.length} of ${HOME_PAGE_MAX_SELECTED_COURSES} chosen. Narrow screens show the first two or three.`}
          </p>

          {section.courseIds.length > 0 ? (
            <ol className="mt-3 grid gap-2">
              {section.courseIds.map((courseId, index) => {
                const course = courseById.get(courseId);
                const title = course?.title ?? "Unavailable course";
                return (
                  <li
                    key={courseId}
                    className={`flex items-center gap-3 p-2 pl-3 ${insetRowClass}`}
                  >
                    <span className="w-4 shrink-0 text-center text-xs font-semibold text-(--muted) tabular-nums">
                      {index + 1}
                    </span>
                    <span className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-(--track)">
                      {course?.thumbnailUrl ? (
                        <img
                          src={course.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-(--text)">
                        {title}
                      </span>
                      {course ? null : (
                        <span className="block text-xs text-(--muted)">
                          {optionsLoading
                            ? "Loading..."
                            : "No longer published here, so it is not shown."}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Move ${title} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={16} weight="bold" />
                    </button>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Move ${title} down`}
                      disabled={index === section.courseIds.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={16} weight="bold" />
                    </button>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Remove ${title}`}
                      onClick={() =>
                        setCourseIds(
                          section.courseIds.filter((item) => item !== courseId),
                        )
                      }
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-rose-500" role="status">
              Choose at least one course, or switch back to automatic.
            </p>
          )}
        </div>
      ) : null}
    </SettingsSection>
  );
}
