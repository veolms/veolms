import type { Dispatch, SetStateAction } from "react";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ThemedSelect } from "../../ThemedSelect";
import type { CourseValidationArea } from "@veolms/contracts";
import type { ChecklistState } from "./basicsState";
import type { CourseVisibility, PublishState } from "./editorLocalTypes";

export interface PublishStepPanelProps {
  isPublished: boolean;
  publishSettings: PublishState;
  setPublishSettings: Dispatch<SetStateAction<PublishState>>;
  validationChecklistItems: {
    area: CourseValidationArea;
    label: string;
    summary: string;
  }[];
  getChecklistState: (area: CourseValidationArea) => ChecklistState;
  serverValidation:
    | {
        canPublish: boolean;
        sections: {
          basics: { valid: boolean; errors: string[] };
          curriculum: { valid: boolean; errors: string[] };
          accessRules: { valid: boolean; errors: string[] };
          pricing: { valid: boolean; errors: string[] };
          extras: { valid: boolean; errors: string[] };
        };
        errors: { message: string }[];
      }
    | undefined;
  expandedValidationArea:
    "basics" | "curriculum" | "accessRules" | "pricing" | "extras" | null;
  setExpandedValidationArea: Dispatch<
    SetStateAction<
      "basics" | "curriculum" | "accessRules" | "pricing" | "extras" | null
    >
  >;
  isCourseReadyToPublish: boolean;
}

export function PublishStepPanel({
  isPublished,
  publishSettings,
  setPublishSettings,
  validationChecklistItems,
  getChecklistState,
  serverValidation,
  expandedValidationArea,
  setExpandedValidationArea,
  isCourseReadyToPublish,
}: PublishStepPanelProps) {
  // prettier-ignore
  return (
    <div className="flex w-full flex-col gap-5">
      {/* Top 2-Column Grid: 1. Publish settings & 2. Final checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
        {/* Card 1: Publish settings */}
        <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
          <div className="mb-4.5">
            <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
              1. Publish settings
            </h3>
            <p className="m-0 text-(--muted) text-[0.83rem]">
              Choose when and how your course becomes visible.
            </p>
          </div>

          {/* Informational Course Status Display */}
          <div className="flex flex-col gap-1.5 mb-4.5">
            <label className="text-(--text) text-[0.86rem] font-[650]">
              Course status
            </label>
            <div className="flex items-center mt-0.5">
              <span
                className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.8rem] font-bold uppercase tracking-[0.04em] ${
                  isPublished
                    ? "is-published border border-green-500/35 text-green-500 bg-green-500/12"
                    : "is-draft border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                }`}
              >
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
            <p className="m-0 mt-1 text-(--muted) text-[0.78rem] leading-[1.4]">
              {isPublished
                ? "Your course is currently published and visible to students according to your settings."
                : "Your course is currently a draft and hasn't been published yet."}
            </p>
          </div>
          {/* Course visibility select */}
          <div className="flex flex-col gap-1.5 mb-4.5">
            <div className="flex items-center justify-between">
              <label className="text-(--text) text-[0.86rem] font-[650]">
                Course visibility
              </label>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                Coming soon
              </span>
            </div>
            <div className="opacity-60 cursor-not-allowed pointer-events-none">
              <ThemedSelect
                disabled
                value={publishSettings.visibility}
                onValueChange={(val) =>
                  setPublishSettings((prev) => ({
                    ...prev,
                    visibility: val as CourseVisibility,
                  }))
                }
                options={[
                  [
                    "public",
                    "Public — Anyone on the platform can discover and enroll in this course.",
                  ],
                  [
                    "private",
                    "Private — Only invited students can access this course.",
                  ],
                  [
                    "unlisted",
                    "Unlisted — Only users with a direct link can view this course.",
                  ],
                ]}
                ariaLabel="Select course visibility (Coming soon)"
                triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-(--muted) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold !cursor-not-allowed"
              />
            </div>
          </div>

          {/* Publish on radio options */}
          <div className="flex flex-col gap-1.5 mb-4.5">
            <div className="flex items-center justify-between">
              <label className="text-(--text) text-[0.86rem] font-[650]">
                Publish on
              </label>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                Coming soon
              </span>
            </div>

            <div className="flex flex-col gap-2.5 opacity-60 pointer-events-none cursor-not-allowed select-none">
              {/* Option 1: Publish immediately */}
              <div
                className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-not-allowed select-none ${
                  publishSettings.scheduleOption === "now"
                    ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                }`}
              >
                <div
                  className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    publishSettings.scheduleOption === "now"
                      ? "border-(--accent)"
                      : "border-(--muted)"
                  }`}
                >
                  {publishSettings.scheduleOption === "now" && (
                    <div className="w-2 h-2 rounded-full bg-(--accent)" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.75">
                  <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                    Publish immediately
                  </strong>
                  <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                    Make this course live immediately upon saving.
                  </p>
                </div>
              </div>

              {/* Option 2: Schedule for later */}
              <div
                className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 cursor-not-allowed select-none ${
                  publishSettings.scheduleOption === "later"
                    ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                }`}
              >
                <div
                  className={`flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    publishSettings.scheduleOption === "later"
                      ? "border-(--accent)"
                      : "border-(--muted)"
                  }`}
                >
                  {publishSettings.scheduleOption === "later" && (
                    <div className="w-2 h-2 rounded-full bg-(--accent)" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.75">
                  <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                    Schedule for a future date
                  </strong>
                  <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                    Set a specific date and time when this course
                    should go live.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Pre-publish Checklist */}
        <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
          <div className="mb-4.5">
            <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
              2. Pre-publish Checklist
            </h3>
            <p className="m-0 text-(--muted) text-[0.83rem]">
              Review all required items before publishing your
              course.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 mb-5">
            {validationChecklistItems.map((item) => {
              const state = getChecklistState(item.area);
              const sectionErrors =
                serverValidation?.sections[item.area].errors ?? [];
              const isInvalid = state === "invalid";
              const isExpanded =
                isInvalid && expandedValidationArea === item.area;
              const errorSummary =
                sectionErrors.length > 1
                  ? String(sectionErrors.length) + " issues"
                  : sectionErrors[0] || "Needs attention";

              return (
                <div key={item.area}>
                  <div
                    className={[
                      "flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-[border-color,background-color] duration-150 ease-out",
                      isExpanded
                        ? "rounded-t-[10px] rounded-b-none"
                        : "rounded-[10px]",
                    ].join(" ")}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {state === "validating" ? (
                        <CircleNotch
                          size={20}
                          className="shrink-0 animate-spin text-(--accent)"
                        />
                      ) : state === "valid" ? (
                        <CheckCircle
                          size={20}
                          weight="fill"
                          className="shrink-0 text-green-500"
                        />
                      ) : state === "invalid" ? (
                        <WarningCircle
                          size={20}
                          weight="fill"
                          className="shrink-0 text-rose-400"
                        />
                      ) : (
                        <Info
                          size={20}
                          weight="fill"
                          className="shrink-0 text-(--muted)"
                        />
                      )}
                      <strong className="truncate text-(--text) text-[0.9rem] font-[650]">
                        {item.label}
                      </strong>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[0.82rem]">
                      {state === "validating" ? (
                        <span className="text-(--accent)">
                          Validating...
                        </span>
                      ) : state === "idle" ? (
                        <span className="text-(--muted)">
                          Not checked
                        </span>
                      ) : state === "valid" ? (
                        <span className="text-(--muted)">
                          {item.summary}
                        </span>
                      ) : (
                        <>
                          <span className="max-w-[15rem] truncate text-rose-400">
                            {errorSummary}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                            onClick={() =>
                              setExpandedValidationArea(
                                isExpanded ? null : item.area,
                              )
                            }
                            aria-expanded={isExpanded}
                            aria-controls={
                              "validation-errors-" + item.area
                            }
                            aria-label={
                              (isExpanded ? "Hide" : "Show") +
                              " " +
                              item.label +
                              " validation errors"
                            }
                          >
                            <CaretRight
                              size={16}
                              weight="bold"
                              className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${isExpanded ? "rotate-90" : "rotate-0"}`}
                            />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    id={"validation-errors-" + item.area}
                    aria-hidden={!isExpanded}
                    className={[
                      "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                      isExpanded
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0 pointer-events-none",
                    ].join(" ")}
                  >
                    <div className="min-h-0">
                      <div className="-mt-px border-x border-b border-[color-mix(in_srgb,#fb7185_24%,transparent)] rounded-b-[10px] bg-[color-mix(in_srgb,#fb7185_5%,var(--surface))] px-4 py-3 text-[0.78rem] leading-[1.45] text-(--text-secondary)">
                        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 marker:text-rose-400">
                          {sectionErrors.map((message, index) => (
                            <li key={item.area + "-error-" + index}>
                              {message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ready-to-publish State Box */}
          {isCourseReadyToPublish ? (
            <div className="flex items-center gap-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-4.5 py-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
              <div className="flex w-10.5 h-10.5 shrink-0 items-center justify-center rounded-xl text-(--accent) bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
                <BookOpen size={24} weight="fill" />
              </div>
              <div>
                <strong className="block mb-0.75 text-(--text) text-[0.94rem] font-bold">
                  Your course is ready to be published!
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                  Once published, students can see and enroll in
                  this course according to your settings.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 border border-red-500/30 rounded-xl px-4.5 py-4 bg-red-500/8">
              <div className="flex w-10.5 h-10.5 shrink-0 items-center justify-center rounded-xl text-red-500 bg-red-500/16">
                <Info size={24} weight="bold" />
              </div>
              <div>
                <strong className="block mb-0.75 text-(--text) text-[0.94rem] font-bold">
                  Course needs attention
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem]">
                  Please fix incomplete sections highlighted above
                  before publishing.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Card 3: What happens after publishing? */}
      <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
        <h3 className="m-0 mb-4.5 text-(--text) text-[1.05rem] font-bold">
          3. What happens after publishing?
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Feature 1: Visible to students */}
          <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
            <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14]">
              <Eye size={22} weight="bold" />
            </div>
            <div>
              <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                Visible to students
              </strong>
              <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                Students will be able to discover your course on the
                platform.
              </p>
            </div>
          </div>

          {/* Feature 2: Enrollment starts */}
          <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
            <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14]">
              <UserPlus size={22} weight="bold" />
            </div>
            <div>
              <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                Enrollment starts
              </strong>
              <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                Students who meet the access rules can enroll in
                your course.
              </p>
            </div>
          </div>

          {/* Feature 3: Track performance */}
          <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
            <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14]">
              <PlayCircle size={22} weight="fill" />
            </div>
            <div>
              <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                Track performance
              </strong>
              <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                Monitor enrollments, progress, and engagement in
                real-time.
              </p>
            </div>
          </div>

          {/* Feature 4: Earn with every sale */}
          <div className="flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
            <div className="flex w-10 h-10 items-center justify-center rounded-[10px] text-pink-500 bg-pink-500/[0.14]">
              <ChartBar size={22} weight="bold" />
            </div>
            <div>
              <strong className="block mb-1 text-(--text) text-[0.9rem] font-[650]">
                Earn with every sale
              </strong>
              <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                Get paid for every successful enrollment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
