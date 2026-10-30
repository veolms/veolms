import type { CourseIncludeKind } from "@veolms/contracts";
// Publish interfaces
export type CourseVisibility = "public" | "private" | "unlisted";

export type ScheduleOption = "now" | "later";

export interface PublishState {
  visibility: CourseVisibility;
  scheduleOption: ScheduleOption;
  scheduleDate: string;
  scheduleTime: string;
}

// Extras interfaces
/**
 * A "This course includes" line as the editor holds it: the stored line's
 * fields, plus whether it is still being created.
 */
export interface IncludeDraftItem {
  id: string;
  text: string;
  detail?: string | null;
  icon?: string | null;
  color?: string | null;
  kind?: CourseIncludeKind;
  isPendingCreation?: boolean;
}

export interface ExtrasInclusionItem {
  id: string;
  text: string;
}

export type CertificateIssuanceType = "completion" | "percentage" | "custom";

export interface ExtrasState {
  inclusions: ExtrasInclusionItem[];
  enableCertificate: boolean;
  certificateTemplate: string;
  issuanceType: CertificateIssuanceType;
  minCompletionPercentage: number;
  customRuleText: string;
  autoEmailCertificate: boolean;
}

export interface PersistLessonOptions {
  collapseOnSuccess?: boolean;
  showCleanToast?: boolean;
  explicitCourseId?: string | null;
}
