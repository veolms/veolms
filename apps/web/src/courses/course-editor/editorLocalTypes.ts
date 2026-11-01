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
