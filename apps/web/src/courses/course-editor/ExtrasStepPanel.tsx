import type { ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ThemedSelect } from "../../ThemedSelect";
import { SettingsToggle } from "../../settings/SettingsControls";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CourseIncludeIcon,
  CourseIncludePreset,
  ReorderCourseIncludesRequest,
} from "@veolms/contracts";
import { videoIncludeWords } from "../overview/coursePurchasePerks";
import { CourseIncludesEditor } from "./CourseIncludesEditor";
import { ExtrasControlStatusIndicator } from "./statusIndicators";
import type { ApiError } from "../../lib/api-error";
import type { ExtrasState } from "./editorLocalTypes";
import type { IncludeDraftItem } from "./editorLocalTypes";

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
  manualIncludesDraft: IncludeDraftItem[];
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
  handleManualInclusionBlur: (id: string) => Promise<void>;
  handleUpdateManualInclusionText: (id: string, text: string) => void;
  handleUpdateManualInclusionDetail: (id: string, detail: string) => void;
  handleSetInclusionStyle: (
    id: string,
    style: { icon?: CourseIncludeIcon; color?: string },
  ) => Promise<void>;
  handleDeleteManualInclusion: (id: string) => Promise<void>;
  handleAddManualInclusion: (
    preset?: Partial<Omit<CourseIncludePreset, "color">>,
  ) => Promise<void>;
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
  handleManualInclusionBlur,
  handleUpdateManualInclusionText,
  handleUpdateManualInclusionDetail,
  handleSetInclusionStyle,
  handleDeleteManualInclusion,
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

        {/* Card 2: This course includes, edited as learners see it */}
        <div className="flex flex-col h-fit border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                2. This course includes
              </h3>
              <p className="m-0 text-(--muted) text-[0.83rem]">
                Learners see this list on the course page, as shown here.
                Click a line to change its words, icon or colour.
              </p>
            </div>
            {isReorderingIncludes || reorderIncludesMutation.isPending ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-(--accent) text-[0.72rem] font-bold">
                <CircleNotch size={12} className="animate-spin" />
                Saving order…
              </span>
            ) : (
              <ExtrasControlStatusIndicator
                status={extrasControlStatus["inclusions"] ?? null}
                testId="extras-field-status-inclusions"
              />
            )}
          </div>
          <CourseIncludesEditor
            items={manualIncludesDraft}
            videoWords={videoIncludeWords({
              duration: computedDuration,
              lessons: totalLessons,
              sections: totalSections,
            })}
            busy={
              isReorderingIncludes ||
              reorderIncludesMutation.isPending ||
              isExtrasSaving
            }
            isSaving={(id) => savingIncludeIds.has(id)}
            isDeleting={(id) => deletingIncludeIds.has(id)}
            statusOf={getExtrasControlDisplayStatus}
            dragEnabledId={dragEnabledInclusionId}
            setDragEnabledId={setDragEnabledInclusionId}
            onAdd={(preset) => void handleAddManualInclusion(preset)}
            onTextChange={handleUpdateManualInclusionText}
            onDetailChange={handleUpdateManualInclusionDetail}
            onCommit={(id) => void handleManualInclusionBlur(id)}
            onStyle={(id, style) => void handleSetInclusionStyle(id, style)}
            onDelete={(id) => void handleDeleteManualInclusion(id)}
            onDragStart={handleInclusionDragStart}
            onDragOver={handleInclusionDragOver}
            onDragEnd={() => void handleInclusionDragEnd()}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
