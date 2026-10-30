import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import type { CourseWizardStepId } from "./wizardSteps";

export function CourseWizardSkeleton({
  activeStep = "basics",
}: {
  activeStep?: CourseWizardStepId;
}) {
  return (
    <div
      id="course-wizard-tab-panel"
      className="swipeable-tab-panel course-wizard-tab-content relative min-h-0 flex-1 flex flex-col pt-4 pb-6 max-[640px]:pt-3 animate-pulse"
      role="tabpanel"
      aria-labelledby={`course-wizard-tab-${activeStep}`}
      data-testid="course-wizard-skeleton"
      data-wizard-step={activeStep}
    >
      <div className="swipeable-tab-panel__native-slide w-full min-w-0">
        {activeStep === "basics" ? (
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] gap-6 items-start max-[768px]:gap-4.5 w-full min-w-0">
            {/* Left Column: Basic Information Form */}
            <div className="flex flex-col gap-5">
              <section className="relative z-10 rounded-[14px] p-6 bg-(--surface) shadow-(--card-shadow) max-[768px]:p-4">
                <div className="mb-4.5">
                  <h2 className="m-0 text-(--text) text-[1.18rem] font-[650] tracking-[-0.015em]">
                    Basic Information
                  </h2>
                  <p className="m-0 mt-1 mb-5 text-(--muted) text-[0.82rem]">
                    Update the essential details of your course.
                  </p>
                </div>

                {/* Course Title */}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="h-11 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                </div>

                {/* Short Description */}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="h-4 w-36 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="h-18 w-full rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                </div>

                {/* Course Description with Rich Text Toolbar */}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                  <div className="border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] overflow-hidden bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                    <div className="h-10 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] flex items-center gap-2 px-3">
                      <div className="h-6 w-16 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                      <div className="h-6 w-6 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    </div>
                    <div className="h-36 w-full p-3.5">
                      <div className="h-4 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)] mb-2.5" />
                      <div className="h-4 w-1/2 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    </div>
                  </div>
                </div>

                {/* 2-Column: Category & Difficulty */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-24 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                </div>

                {/* 2-Column: Language & Instructor Alias */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-20 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]" />
                  </div>
                </div>

                {/* Media Uploaders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="aspect-video w-full rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] flex flex-col items-center justify-center p-3">
                    <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mb-2" />
                    <div className="h-7 w-20 rounded-md bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                  </div>
                  <div className="aspect-video w-full rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] flex flex-col items-center justify-center p-3">
                    <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mb-2" />
                    <div className="h-7 w-20 rounded-md bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Live Course Preview */}
            <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-0 md:self-start">
              <section className="rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow)">
                <h2 className="m-0 text-(--text) text-[1.1rem] font-[650]">
                  Course Preview
                </h2>
                <p className="m-0 mt-1 mb-4 text-(--muted) text-[0.8rem]">
                  This is how your course will appear to students.
                </p>

                {/* Aspect-video dashed preview */}
                <div className="aspect-video w-full border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[10px] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] flex flex-col items-center justify-center gap-2 p-4 mb-4">
                  <div className="w-9 h-9 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center">
                    <div className="w-4 h-4 rounded bg-[color-mix(in_srgb,var(--text)_15%,transparent)]" />
                  </div>
                  <div className="h-3 w-44 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="h-5 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                  <div className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-3 text-(--muted) text-[0.8rem]">
                    <div className="h-3.5 w-20 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3.5 w-20 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3.5 w-16 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="pt-1 flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                    <div className="h-3 w-full rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                    <div className="h-3 w-4/5 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : activeStep === "curriculum" ? (
          <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between mb-2 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
              <div>
                <h2 className="m-0 text-(--text) text-[1.25rem] font-bold tracking-[-0.015em]">
                  Course Curriculum
                </h2>
                <p className="m-0 mt-1 text-(--muted) text-[0.85rem]">
                  Organize your course into sections and lessons. You can
                  reorder them anytime.
                </p>
              </div>
              <div className="inline-flex items-center justify-center gap-1.5 h-[34px] px-4 rounded-lg bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-white text-[0.80rem] font-bold max-[768px]:self-start">
                <Plus size={15} weight="bold" />
                <span>Add Section</span>
              </div>
            </div>

            {/* Section 1 Card */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] bg-(--surface) shadow-(--card-shadow) overflow-hidden">
              {/* Section Header */}
              <div className="flex items-center justify-between px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]">
                <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                  <DotsSixVertical
                    size={18}
                    className="text-(--muted) opacity-40 shrink-0"
                  />
                  <CaretDown size={16} className="text-(--muted) shrink-0" />
                  <div className="h-4.5 w-40 max-[640px]:w-28 max-[480px]:w-24 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] shrink-0" />
                  <div className="h-4.5 flex-1 max-w-36 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                  <div className="h-5 w-18 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 max-[480px]:hidden" />
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-end max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>

              {/* Lessons List inside Section 1 */}
              <div className="p-[14px_18px] max-[768px]:p-[12px_14px] flex flex-col gap-2.5">
                {/* Lesson 1 */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <DotsSixVertical
                      size={16}
                      className="text-(--muted) opacity-40 shrink-0"
                    />
                    <PlayCircle
                      size={20}
                      className="text-(--accent) opacity-60 shrink-0"
                      weight="fill"
                    />
                    <div className="h-4 flex-1 max-w-64 min-w-16 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Lesson 2 */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <DotsSixVertical
                      size={16}
                      className="text-(--muted) opacity-40 shrink-0"
                    />
                    <PlayCircle
                      size={20}
                      className="text-(--accent) opacity-60 shrink-0"
                      weight="fill"
                    />
                    <div className="h-4 flex-1 max-w-48 min-w-16 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Lesson 3 */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <DotsSixVertical
                      size={16}
                      className="text-(--muted) opacity-40 shrink-0"
                    />
                    <PlayCircle
                      size={20}
                      className="text-(--accent) opacity-60 shrink-0"
                      weight="fill"
                    />
                    <div className="h-4 flex-1 max-w-56 min-w-16 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                    <div className="h-4 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-6 w-16 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] max-[640px]:hidden" />
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  </div>
                </div>

                {/* Add Lesson action */}
                <div className="mt-1">
                  <div className="inline-flex items-center gap-1.5 text-(--muted) text-[0.82rem] font-semibold">
                    <Plus size={16} />
                    <span>Add Lesson</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2 Card */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] bg-(--surface) shadow-(--card-shadow) overflow-hidden">
              <div className="flex items-center justify-between px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] select-none max-[768px]:flex-wrap max-[768px]:gap-2.5 max-[768px]:p-[12px_14px]">
                <div className="flex items-center gap-3 max-[768px]:flex-1 max-[768px]:w-full max-[768px]:min-w-0 max-[768px]:gap-2">
                  <DotsSixVertical
                    size={18}
                    className="text-(--muted) opacity-40 shrink-0"
                  />
                  <CaretRight size={16} className="text-(--muted) shrink-0" />
                  <div className="h-4.5 w-40 max-[640px]:w-28 max-[480px]:w-24 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] shrink-0" />
                  <div className="h-4.5 flex-1 max-w-44 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                  <div className="h-5 w-18 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 max-[480px]:hidden" />
                </div>
                <div className="flex items-center gap-1.5 max-[768px]:w-full max-[768px]:justify-end max-[768px]:pt-2 max-[768px]:border-t max-[768px]:border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                  <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "access-rules" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top Grid: 1. Who can access & 2. Access duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Who can access this course? */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Who can access this course?
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Choose who is allowed to access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option: Everyone */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Everyone
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Anyone with access to the platform can access this
                        course.
                      </p>
                    </div>
                  </div>

                  {/* Option: Restricted access */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] opacity-60">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <div className="flex items-center gap-2">
                        <strong className="text-(--text) text-[0.9rem] font-[650] leading-[18px]">
                          Restricted access
                        </strong>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                          Coming soon
                        </span>
                      </div>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Only users who meet the selected requirements can access
                        this course.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Access duration */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. Access duration
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Set how long learners can access this course.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option 1: Lifetime access */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Lifetime access
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Learners can access this course forever.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Fixed duration */}
                  <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 px-4 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                    <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                    <div className="flex flex-1 flex-col gap-0.75">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Fixed duration
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                        Set a specific number of days or months learners have
                        access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Additional Settings (Toggles) */}
            <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
              <div className="mb-4.5">
                <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                  3. Additional Settings
                </h3>
                <p className="m-0 text-(--muted) text-[0.83rem]">
                  Configure social and learning features for this course.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <ChatCircleText size={20} weight="fill" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                        Comments
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">
                        Allow learners to comment on course content.
                      </p>
                    </div>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
                </div>

                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                      <NotePencil size={20} weight="bold" />
                    </div>
                    <div>
                      <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                        Notes
                      </strong>
                      <p className="m-0 text-(--muted) text-[0.8rem]">
                        Allow learners to take notes while learning.
                      </p>
                    </div>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
                </div>
              </div>
            </div>
          </div>
        ) : activeStep === "pricing" ? (
          <div className="flex w-full flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Price details */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    Price details
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Set the pricing for your course.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                      Currency <span className="text-[#ff5252] ml-0.5">*</span>
                    </label>
                    <div className="h-11 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 flex items-center justify-between bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                      <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-2">
                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Price (INR){" "}
                        <span className="text-[#ff5252] ml-0.5">*</span>
                      </label>
                      <div className="h-11 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 flex items-center bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                        <div className="h-4 w-16 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Original Price (Optional)
                      </label>
                      <div className="h-11 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] px-3.5 flex items-center bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                        <div className="h-4 w-16 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Pricing Summary */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow) flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] flex items-center justify-center text-(--accent)">
                  <Tag size={20} weight="bold" />
                </div>
                <div>
                  <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] mb-1" />
                  <div className="h-3 w-48 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
              <div className="h-7 w-24 rounded-lg bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]" />
            </div>
          </div>
        ) : activeStep === "extras" ? (
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Certificates & 2. This course includes */}
            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Certificates */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Certificates
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Configure how certificates will be issued for this course.
                  </p>
                </div>

                {/* Enable Certificate Toggle Row */}
                <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] mb-4.5">
                  <div className="flex flex-col min-w-0 pr-3">
                    <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                      Enable certificate
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem]">
                      Issue certificates to learners on course completion.
                    </p>
                  </div>
                  <div className="w-11 h-6 rounded-full bg-[color-mix(in_srgb,var(--text)_18%,transparent)] shrink-0" />
                </div>

                {/* Certificate Configuration Controls */}
                <div className="flex flex-col gap-4.5 opacity-60">
                  {/* Template Selector */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Certificate template
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                      Choose from pre-designed certificate templates.
                    </p>
                    <div className="h-10 w-full rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5 flex items-center justify-between">
                      <div className="h-4 w-44 rounded bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  {/* Certificate Issuance Options */}
                  <div className="flex flex-col gap-2 mb-5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-(--text-secondary) text-[0.84rem] font-semibold">
                        Certificate issuance
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                        Coming soon
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                      Choose when the certificate should be issued.
                    </p>

                    <div className="flex flex-col gap-2.5">
                      {/* Option 1: On course completion */}
                      <div className="relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                        <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                          <div className="w-2 h-2 rounded-full bg-(--accent)" />
                        </div>
                        <div className="flex flex-1 flex-col gap-0.75">
                          <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                            On course completion
                          </strong>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Issue certificate when the learner completes all
                            lessons.
                          </p>
                        </div>
                      </div>

                      {/* Option 2: Minimum completion percentage */}
                      <div className="relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                        <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
                        <div className="flex flex-1 flex-col gap-0.75">
                          <div className="flex items-center justify-between w-full">
                            <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                              Minimum completion percentage
                            </strong>
                            <div className="flex items-center gap-1.5">
                              <div className="w-[76px] h-8 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] flex items-center justify-center text-(--muted) text-[0.86rem] font-semibold">
                                95
                              </div>
                              <span className="text-(--text) text-[0.86rem] font-bold">
                                %
                              </span>
                            </div>
                          </div>
                          <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                            Issue certificate when learner reaches the selected
                            percentage.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: This course includes */}
              <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    2. This course includes
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    These details are calculated from your curriculum.
                  </p>
                </div>

                {/* 3 Metrics Cards */}
                <div className="grid grid-cols-1 min-[1024px]:grid-cols-3 gap-3 mb-6 max-[768px]:gap-2.5">
                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14]">
                      <BookOpen size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-6 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-(--muted) text-[0.74rem] font-medium">
                        Sections
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14]">
                      <PlayCircle size={20} weight="fill" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-6 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-(--muted) text-[0.74rem] font-medium">
                        Lessons
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                    <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14]">
                      <Clock size={20} weight="bold" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="h-4 w-8 rounded bg-[color-mix(in_srgb,var(--text)_16%,transparent)]" />
                      <span className="text-(--muted) text-[0.74rem] font-medium">
                        Content length
                      </span>
                    </div>
                  </div>
                </div>

                {/* Course Inclusions Header */}
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="m-0 text-(--text) text-[0.95rem] font-bold">
                      Course inclusions
                    </h4>
                    <span className="inline-flex items-center px-2.5 py-0.75 rounded-full text-[0.72rem] font-bold bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      3 / 6
                    </span>
                  </div>
                  <p className="m-0 text-(--muted) text-[0.82rem] leading-normal">
                    Perks and benefits your learners will receive upon enrolling
                    (max 6 items). Click suggestions below or add custom
                    inclusions.
                  </p>

                  {/* Inclusion items */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                      <DotsSixVertical
                        size={18}
                        className="text-(--muted) opacity-40 shrink-0"
                      />
                      <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] flex-1" />
                      <div className="w-7 h-7 rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] flex items-center justify-center text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                      <DotsSixVertical
                        size={18}
                        className="text-(--muted) opacity-40 shrink-0"
                      />
                      <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] flex-1" />
                      <div className="w-7 h-7 rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] flex items-center justify-center text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]">
                      <DotsSixVertical
                        size={18}
                        className="text-(--muted) opacity-40 shrink-0"
                      />
                      <div className="h-4 w-36 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] flex-1" />
                      <div className="w-7 h-7 rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] flex items-center justify-center text-(--muted) opacity-40">
                        <Trash size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Suggested perks chips */}
                  <div className="flex flex-col gap-2 mt-2">
                    <span className="text-(--muted) text-[0.74rem] font-bold uppercase tracking-wider">
                      Suggested perks (click to add)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-(--muted) text-[0.8rem] font-medium bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                        <Plus size={13} weight="bold" />
                        <span>Community access</span>
                      </div>
                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-(--muted) text-[0.8rem] font-medium bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
                        <Plus size={13} weight="bold" />
                        <span>Assignments & feedback</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* activeStep === 'publish' */
          <div className="flex w-full flex-col gap-5">
            {/* Top 2-Column Grid: 1. Publish settings & 2. Pre-publish Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-5 max-[768px]:gap-3.5 w-full min-w-0">
              {/* Card 1: Publish settings */}
              <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
                <div className="mb-4.5">
                  <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                    1. Publish settings
                  </h3>
                  <p className="m-0 text-(--muted) text-[0.83rem]">
                    Choose when and how your course becomes visible.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Status row */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-(--text) text-[0.86rem] font-[650]">
                      Course status
                    </label>
                    <div className="flex items-center mt-0.5">
                      <span className="inline-flex items-center rounded-md px-2.5 py-1 text-[0.8rem] font-bold uppercase tracking-[0.04em] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                        Draft
                      </span>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-(--text) text-[0.86rem] font-[650]">
                      Course visibility
                    </label>
                    <div className="h-10 w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3.5 flex items-center justify-between bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
                      <div className="h-4 w-28 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                      <CaretDown size={14} className="text-(--muted)" />
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="flex flex-col gap-2">
                    <label className="text-(--text) text-[0.86rem] font-[650]">
                      Publish on
                    </label>
                    <div className="relative flex items-center gap-3.5 border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] rounded-xl p-3 px-4 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]">
                      <div className="flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--accent)">
                        <div className="w-2 h-2 rounded-full bg-(--accent)" />
                      </div>
                      <strong className="text-(--text) text-[0.88rem] font-[650]">
                        Publish immediately
                      </strong>
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
                    Review all required items before publishing your course.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {/* Step Checklist Items */}
                  {[
                    "Basics",
                    "Curriculum",
                    "Access Rules",
                    "Pricing",
                    "Extras",
                  ].map((stepTitle) => (
                    <div
                      key={stepTitle}
                      className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[10px] px-4 py-3 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle
                          size={20}
                          weight="fill"
                          className="text-green-500 opacity-80"
                        />
                        <strong className="text-(--text) text-[0.9rem] font-[650]">
                          {stepTitle}
                        </strong>
                      </div>
                      <div className="flex items-center gap-2 text-(--muted) text-[0.82rem]">
                        <span>Ready</span>
                        <CaretRight size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Readiness banner */}
            <div className="border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 bg-(--surface) shadow-(--card-shadow) flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] flex items-center justify-center text-(--accent)">
                  <Lightning size={22} weight="fill" />
                </div>
                <div>
                  <div className="h-4.5 w-48 rounded bg-[color-mix(in_srgb,var(--text)_14%,transparent)] mb-1" />
                  <div className="h-3.5 w-72 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                </div>
              </div>
              <div className="h-9 w-28 rounded-lg bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
