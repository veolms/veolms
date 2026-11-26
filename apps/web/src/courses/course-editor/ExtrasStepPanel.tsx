import type { ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
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
import { CourseCertificateThreshold } from "../../certificates/CourseCertificateThreshold";
import { CourseCertificatesSection } from "../../certificates/CourseCertificatesSection";

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
  /** The access line's title, from the Access rules step (see `accessIncludeTitle`). */
  accessTitle: string | null;
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
  /** The course being edited; none before its first save. */
  courseId?: string | null;
  /** Sections plugins added to this step (PluginCourseEditorSections). */
  children?: ReactNode;
}

export function ExtrasStepPanel({
  getExtrasControlDisplayStatus,
  extras,
  isSavingCertificate,
  handleToggleCertificate,
  totalSections,
  totalLessons,
  computedDuration,
  accessTitle,
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
  courseId,
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

          {/* What a learner must finish, and the design (certificates/). */}
          <div
            className={`flex flex-col gap-4.5 transition-opacity duration-200 ${
              !extras.enableCertificate
                ? "is-disabled opacity-50 pointer-events-none"
                : ""
            }`}
          >
            {courseId ? (
              <CourseCertificateThreshold
                courseId={courseId}
                disabled={!extras.enableCertificate}
              />
            ) : (
              <p className="m-0 text-(--muted) text-[0.8rem]">
                Save the course to set what learners must finish.
              </p>
            )}
            <div className="flex flex-col gap-1 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3.5">
              <strong className="text-(--text) text-[0.88rem] font-[650]">
                Design
              </strong>
              <p className="m-0 text-(--muted) text-[0.78rem]">
                The design finalised in Platform &gt; Certificates, with the
                learner&apos;s name, the course, the date, the signature and a QR
                code that opens the certificate&apos;s public page. Learners are
                notified and emailed the PDF when theirs is issued.
              </p>
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
            accessTitle={accessTitle}
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
      {courseId && extras.enableCertificate ? (
        <CourseCertificatesSection courseId={courseId} />
      ) : null}
      {children}
    </div>
  );
}
