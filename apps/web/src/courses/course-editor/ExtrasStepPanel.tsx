import type { ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ThemedSelect } from "../../ThemedSelect";
import { SettingsToggle } from "../../settings/SettingsControls";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ReorderCourseIncludesRequest } from "@veolms/contracts";
import { ExtrasControlStatusIndicator } from "./statusIndicators";
import type { ApiError } from "../../lib/api-error";
import type { ExtrasState } from "./editorLocalTypes";

export interface ExtrasStepPanelProps {
  getExtrasControlDisplayStatus: (
    controlKey: string,
  ) => "saving" | "saved" | "failed" | null;
  extras: ExtrasState;
  isSavingCertificate: boolean;
  handleToggleCertificate: () => Promise<void>;
  handleCertificateTemplateChange: (template: string) => void;
  handleToggleAutoEmailCertificate: () => void;
  totalSections: number;
  totalLessons: number;
  computedDuration: string;
  isReorderingIncludes: boolean;
  reorderIncludesMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    { courseId: string; payload: ReorderCourseIncludesRequest },
    unknown
  >;
  extrasControlStatus: Record<string, "saved" | "failed" | null>;
  manualIncludesDraft: {
    id: string;
    text: string;
    isPendingCreation?: boolean;
  }[];
  isExtrasSaving: boolean;
  deletingIncludeIds: Set<string>;
  savingIncludeIds: Set<string>;
  dragEnabledInclusionId: string | null;
  handleInclusionDragStart: (
    e: React.DragEvent,
    index: number,
    text: string,
  ) => void;
  handleInclusionDragOver: (e: React.DragEvent, index: number) => void;
  handleInclusionDragEnd: () => Promise<void>;
  setDragEnabledInclusionId: Dispatch<SetStateAction<string | null>>;
  setFocusedInclusionId: Dispatch<SetStateAction<string | null>>;
  handleManualInclusionBlur: (id: string) => Promise<void>;
  handleUpdateManualInclusionText: (id: string, text: string) => void;
  focusedInclusionId: string | null;
  handleDeleteManualInclusion: (id: string) => Promise<void>;
  suggestedInclusions: string[];
  handleAddManualInclusion: (customText?: string) => Promise<void>;
  /** Sections plugins added to this step (PluginCourseEditorSections). */
  children?: ReactNode;
}

export function ExtrasStepPanel({
  getExtrasControlDisplayStatus,
  extras,
  isSavingCertificate,
  handleToggleCertificate,
  handleCertificateTemplateChange,
  handleToggleAutoEmailCertificate,
  totalSections,
  totalLessons,
  computedDuration,
  isReorderingIncludes,
  reorderIncludesMutation,
  extrasControlStatus,
  manualIncludesDraft,
  isExtrasSaving,
  deletingIncludeIds,
  savingIncludeIds,
  dragEnabledInclusionId,
  handleInclusionDragStart,
  handleInclusionDragOver,
  handleInclusionDragEnd,
  setDragEnabledInclusionId,
  setFocusedInclusionId,
  handleManualInclusionBlur,
  handleUpdateManualInclusionText,
  focusedInclusionId,
  handleDeleteManualInclusion,
  suggestedInclusions,
  handleAddManualInclusion,
  children,
}: ExtrasStepPanelProps) {
  // prettier-ignore
  return (
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
              Configure how certificates will be issued for this
              course.
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
            <div className="flex items-center gap-2.5 shrink-0">
              <ExtrasControlStatusIndicator
                status={getExtrasControlDisplayStatus(
                  "enableCertificate",
                )}
                testId="extras-field-status-enableCertificate"
              />
              <SettingsToggle
                checked={extras.enableCertificate}
                disabled={isSavingCertificate}
                onChange={handleToggleCertificate}
                label="Toggle certificate"
              />
            </div>
          </div>

          {/* Certificate Configuration Controls */}
          <div
            className={`flex flex-col gap-4.5 transition-opacity duration-200 ${
              !extras.enableCertificate
                ? "is-disabled opacity-50 pointer-events-none"
                : ""
            }`}
          >
            {/* Template Selector */}
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                  Certificate template
                </label>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                  Coming soon
                </span>
              </div>
              <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                Choose from pre-designed certificate templates.
              </p>
              <div className="opacity-60 cursor-not-allowed pointer-events-none">
                <ThemedSelect
                  value={extras.certificateTemplate}
                  onValueChange={handleCertificateTemplateChange}
                  options={[
                    [
                      "purple-certificate",
                      "Modern Purple Certificate",
                    ],
                    [
                      "blue-certificate",
                      "Classic Blue Certificate",
                    ],
                    [
                      "dark-certificate",
                      "Minimal Dark Certificate",
                    ],
                  ]}
                  ariaLabel="Select certificate template"
                  className="w-full"
                  disabled
                  triggerClassName="!w-full !h-10 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                />
              </div>
            </div>

            {/* Certificate Issuance Options */}
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-(--text-secondary) text-[0.84rem] font-semibold">
                  Certificate issuance
                </label>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                  Coming soon
                </span>
              </div>
              <p className="m-0 mt-0.5 mb-2 text-(--muted) text-[0.78rem]">
                Choose when the certificate should be issued.
              </p>

              <div className="flex flex-col gap-2.5 opacity-60 cursor-not-allowed pointer-events-none select-none">
                {/* Option 1: On course completion */}
                <div
                  className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                    extras.issuanceType === "completion"
                      ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                  }`}
                >
                  <div
                    className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                      extras.issuanceType === "completion"
                        ? "border-(--accent)"
                        : "border-(--muted)"
                    }`}
                  >
                    {extras.issuanceType === "completion" && (
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.75">
                    <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                      On course completion
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Issue certificate when the learner completes
                      all lessons.
                    </p>
                  </div>
                </div>

                {/* Option 2: Minimum completion percentage */}
                <div
                  className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                    extras.issuanceType === "percentage"
                      ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                  }`}
                >
                  <div
                    className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                      extras.issuanceType === "percentage"
                        ? "border-(--accent)"
                        : "border-(--muted)"
                    }`}
                  >
                    {extras.issuanceType === "percentage" && (
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.75">
                    <div className="flex items-center justify-between w-full">
                      <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                        Minimum completion percentage
                      </strong>
                      {extras.issuanceType === "percentage" && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            disabled
                            className="w-[76px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.86rem] font-semibold outline-none text-center cursor-not-allowed"
                            min={1}
                            max={100}
                            value={extras.minCompletionPercentage}
                            readOnly
                          />
                          <span className="text-(--text) text-[0.86rem] font-bold">
                            %
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Issue certificate when learner reaches the
                      selected percentage.
                    </p>
                  </div>
                </div>

                {/* Option 3: Custom rule */}
                <div
                  className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                    extras.issuanceType === "custom"
                      ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
                  }`}
                >
                  <div
                    className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                      extras.issuanceType === "custom"
                        ? "border-(--accent)"
                        : "border-(--muted)"
                    }`}
                  >
                    {extras.issuanceType === "custom" && (
                      <div className="w-2 h-2 rounded-full bg-(--accent)" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.75">
                    <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                      Custom rule
                    </strong>
                    <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                      Define your own custom rule for certificate
                      issuance.
                    </p>

                    {extras.issuanceType === "custom" && (
                      <div className="mt-2 w-full">
                        <input
                          type="text"
                          disabled
                          readOnly
                          className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-1.75 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] outline-none cursor-not-allowed"
                          value={extras.customRuleText}
                          placeholder="e.g. Complete all quizzes with > 80% score"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Toggle Row */}
            <div className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3.5 opacity-60 cursor-not-allowed">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <strong className="text-(--text) text-[0.88rem] font-[650]">
                    Delivery
                  </strong>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    Coming soon
                  </span>
                </div>
                <p className="m-0 text-(--muted) text-[0.78rem]">
                  Automatically email the certificate to learners.
                </p>
              </div>
              <div className="pointer-events-none">
                <SettingsToggle
                  checked={extras.autoEmailCertificate}
                  onChange={handleToggleAutoEmailCertificate}
                  label="Toggle certificate delivery"
                />
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

          {/* Derived Live Stats Summary Grid */}
          <div className="grid grid-cols-1 min-[1024px]:grid-cols-3 gap-3 mb-6 max-[768px]:gap-2.5">
            <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
              <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-indigo-500 bg-indigo-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                <BookOpen size={20} weight="fill" />
              </div>
              <div className="flex flex-col">
                <strong className="text-(--text) text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                  {totalSections}
                </strong>
                <span className="text-(--muted) text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                  Sections
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
              <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-purple-500 bg-purple-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                <PlayCircle size={20} weight="fill" />
              </div>
              <div className="flex flex-col">
                <strong className="text-(--text) text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]">
                  {totalLessons}
                </strong>
                <span className="text-(--muted) text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                  Lessons
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-3 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] max-[768px]:p-[12px_14px] max-[768px]:gap-3.5">
              <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[10px] text-blue-500 bg-blue-500/[0.14] max-[768px]:w-10 max-[768px]:h-10">
                <Clock size={20} weight="bold" />
              </div>
              <div className="flex flex-col">
                <strong
                  className="text-(--text) text-base font-[750] leading-[1.2] max-[768px]:text-[1.05rem]"
                  data-testid="course-extra-duration"
                >
                  {computedDuration}
                </strong>
                <span className="text-(--muted) text-[0.74rem] font-medium max-[768px]:text-[0.8rem] max-[768px]:whitespace-nowrap">
                  Content length
                </span>
              </div>
            </div>
          </div>

          {/* Divider between Stats & Inclusions */}
          <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] my-4.5" />

          {/* Additional Inclusions Section */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h4 className="m-0 text-(--text) text-[0.95rem] font-bold">
                  Course inclusions
                </h4>
                {isReorderingIncludes ||
                reorderIncludesMutation.isPending ? (
                  <span className="inline-flex items-center gap-1 text-(--accent) text-[0.72rem] font-bold px-2.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
                    <CircleNotch
                      size={12}
                      className="animate-spin text-(--accent)"
                    />
                    <span>Saving inclusion order...</span>
                  </span>
                ) : (
                  <ExtrasControlStatusIndicator
                    status={
                      extrasControlStatus["inclusions"] ?? null
                    }
                    testId="extras-field-status-inclusions"
                  />
                )}
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.75 rounded-full text-[0.72rem] font-bold tracking-wide border ${
                  manualIncludesDraft.length >= 6
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                }`}
              >
                {manualIncludesDraft.length} / 6
              </span>
            </div>
            <p className="m-0 text-(--muted) text-[0.82rem] leading-normal">
              Perks and benefits your learners will receive upon
              enrolling (max 6 items). Click suggestions below or
              add custom inclusions.
            </p>

            {/* Active Inclusions List */}
            <div className="flex flex-col gap-2.5">
              {manualIncludesDraft.length === 0 ? (
                <div className="border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-5 text-center text-(--muted) text-[0.82rem] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))]">
                  No inclusions added yet. Choose from the suggested
                  perks below or add a custom benefit.
                </div>
              ) : (
                manualIncludesDraft.map((item, index) => (
                  <div
                    key={item.id}
                    draggable={
                      !isReorderingIncludes &&
                      !reorderIncludesMutation.isPending &&
                      !isExtrasSaving &&
                      !item.isPendingCreation &&
                      !deletingIncludeIds.has(item.id) &&
                      !savingIncludeIds.has(item.id) &&
                      dragEnabledInclusionId === item.id
                    }
                    onDragStart={(e) =>
                      handleInclusionDragStart(e, index, item.text)
                    }
                    onDragOver={(e) =>
                      handleInclusionDragOver(e, index)
                    }
                    onDragEnd={handleInclusionDragEnd}
                    className={`flex items-center gap-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 px-3.5 bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] transition-all ${
                      item.isPendingCreation ||
                      deletingIncludeIds.has(item.id) ||
                      savingIncludeIds.has(item.id)
                        ? "opacity-75 border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        : isReorderingIncludes || isExtrasSaving
                          ? "opacity-60"
                          : "hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-xs"
                    }`}
                  >
                    {item.isPendingCreation ? (
                      <span
                        className="flex items-center justify-center p-1 rounded-md shrink-0 text-(--accent)"
                        title="Adding inclusion..."
                      >
                        <CircleNotch
                          size={18}
                          className="animate-spin text-(--accent)"
                        />
                      </span>
                    ) : (
                      <span
                        className={`flex items-center justify-center p-1 rounded-md shrink-0 transition-colors ${
                          isReorderingIncludes ||
                          reorderIncludesMutation.isPending ||
                          isExtrasSaving ||
                          deletingIncludeIds.has(item.id) ||
                          savingIncludeIds.has(item.id)
                            ? "opacity-30 cursor-not-allowed pointer-events-none"
                            : "text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] select-none cursor-grab active:cursor-grabbing"
                        }`}
                        onMouseEnter={() => {
                          if (
                            !isReorderingIncludes &&
                            !reorderIncludesMutation.isPending &&
                            !isExtrasSaving &&
                            !deletingIncludeIds.has(item.id) &&
                            !savingIncludeIds.has(item.id)
                          ) {
                            setDragEnabledInclusionId(item.id);
                          }
                        }}
                        onMouseLeave={() =>
                          setDragEnabledInclusionId(null)
                        }
                        title={
                          isReorderingIncludes
                            ? "Saving order..."
                            : deletingIncludeIds.has(item.id)
                              ? "Deleting..."
                              : savingIncludeIds.has(item.id)
                                ? "Saving..."
                                : "Drag to reorder"
                        }
                      >
                        <DotsSixVertical size={18} />
                      </span>
                    )}
                    <input
                      type="text"
                      disabled={
                        isReorderingIncludes ||
                        reorderIncludesMutation.isPending ||
                        isExtrasSaving ||
                        item.isPendingCreation ||
                        deletingIncludeIds.has(item.id) ||
                        savingIncludeIds.has(item.id)
                      }
                      className="flex-1 min-w-0 border-none text-(--text) bg-transparent text-[0.88rem] font-medium outline-none placeholder:text-(--muted) disabled:opacity-60 disabled:cursor-not-allowed"
                      value={item.text}
                      onFocus={() => setFocusedInclusionId(item.id)}
                      onBlur={() => {
                        void handleManualInclusionBlur(item.id);
                      }}
                      onChange={(e) =>
                        handleUpdateManualInclusionText(
                          item.id,
                          e.target.value.slice(0, 25),
                        )
                      }
                      placeholder="e.g. Personal guidance"
                      maxLength={25}
                    />
                    {getExtrasControlDisplayStatus(item.id) ? (
                      <ExtrasControlStatusIndicator
                        status={getExtrasControlDisplayStatus(
                          item.id,
                        )}
                        testId={`extras-field-status-inclusion-${item.id}`}
                      />
                    ) : focusedInclusionId === item.id ? (
                      <span className="text-(--muted) text-[0.74rem] font-medium shrink-0 select-none px-1">
                        {item.text.length} / 25
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        isReorderingIncludes ||
                        reorderIncludesMutation.isPending ||
                        isExtrasSaving ||
                        item.isPendingCreation ||
                        deletingIncludeIds.has(item.id) ||
                        savingIncludeIds.has(item.id)
                      }
                      onClick={() =>
                        handleDeleteManualInclusion(item.id)
                      }
                      className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--surface-strong)60%,transparent)] text-(--muted) hover:!text-[#ef4444] hover:!bg-red-500/10 hover:!border-red-500/30 transition-all bg-transparent cursor-pointer p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none shrink-0"
                      aria-label={
                        deletingIncludeIds.has(item.id)
                          ? "Deleting inclusion..."
                          : "Remove inclusion"
                      }
                      title={
                        deletingIncludeIds.has(item.id)
                          ? "Deleting..."
                          : "Remove inclusion"
                      }
                    >
                      {deletingIncludeIds.has(item.id) ? (
                        <CircleNotch
                          size={14}
                          className="animate-spin text-red-500"
                        />
                      ) : (
                        <Trash size={15} />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Suggested quick-add chips */}
            {manualIncludesDraft.length < 6 &&
              suggestedInclusions.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-(--muted) text-[0.74rem] font-bold uppercase tracking-wider">
                    Suggested perks (click to add)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {suggestedInclusions
                      .slice(0, 6 - manualIncludesDraft.length)
                      .map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          disabled={
                            isReorderingIncludes ||
                            reorderIncludesMutation.isPending ||
                            isExtrasSaving ||
                            manualIncludesDraft.length >= 6
                          }
                          onClick={() =>
                            handleAddManualInclusion(suggestion)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.78rem] font-semibold border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] text-(--text-secondary) hover:text-(--text) hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                        >
                          <Plus size={13} weight="bold" />
                          <span>{suggestion}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

            {/* Add inclusion button */}
            <button
              type="button"
              disabled={
                isReorderingIncludes ||
                reorderIncludesMutation.isPending ||
                isExtrasSaving ||
                manualIncludesDraft.length >= 6
              }
              onClick={() => handleAddManualInclusion()}
              className={`inline-flex items-center justify-center gap-2 h-9 w-full border border-dashed rounded-xl text-[0.84rem] font-bold mt-1 transition-all ${
                manualIncludesDraft.length >= 6 ||
                isReorderingIncludes ||
                isExtrasSaving
                  ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) opacity-50 cursor-not-allowed"
                  : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] hover:border-(--accent) cursor-pointer"
              }`}
              title={
                isReorderingIncludes
                  ? "Saving inclusion order..."
                  : manualIncludesDraft.length >= 6
                    ? "Maximum 6 inclusions reached"
                    : "Add custom inclusion"
              }
            >
              <Plus size={15} weight="bold" />
              <span>
                {manualIncludesDraft.length >= 6
                  ? "Maximum 6 inclusions reached"
                  : "Add custom inclusion"}
              </span>
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
