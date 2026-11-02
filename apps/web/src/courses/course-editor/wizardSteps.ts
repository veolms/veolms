import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/PuzzlePiece";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import type { Permission } from "@veolms/contracts";
import type { ComponentType } from "react";
import { CURRICULUM_PERMISSIONS } from "./curriculumPermissions";

export type CourseWizardStepId =
  "basics" | "curriculum" | "access-rules" | "pricing" | "extras" | "publish";

type WizardStepIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
  className?: string;
}>;

export interface WizardStepDefinition {
  id: CourseWizardStepId;
  label: string;
  Icon: WizardStepIcon;
  tone: "blue" | "cyan" | "gold" | "green" | "orange" | "rose" | "violet";
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: "basics", label: "Basics", Icon: BookOpen, tone: "blue" },
  { id: "curriculum", label: "Curriculum", Icon: ListBullets, tone: "violet" },
  { id: "access-rules", label: "Access Rules", Icon: LockKey, tone: "gold" },
  { id: "pricing", label: "Pricing", Icon: Tag, tone: "green" },
  { id: "extras", label: "Extras", Icon: PuzzlePiece, tone: "orange" },
  { id: "publish", label: "Publish", Icon: Lightning, tone: "rose" },
];

/**
 * What changing each step takes (any one of them). Basics holds the
 * thumbnail, so a thumbnail editor opens it too; the curriculum holds the
 * lessons (see CURRICULUM_PERMISSIONS).
 */
export const WIZARD_STEP_PERMISSIONS: Readonly<
  Record<CourseWizardStepId, readonly Permission[]>
> = {
  basics: ["course.details.update", "course.thumbnail.update"],
  curriculum: CURRICULUM_PERMISSIONS,
  "access-rules": ["course.details.update"],
  pricing: ["course.pricing.update"],
  extras: ["course.details.update"],
  publish: ["course.publish", "course.unpublish"],
};

export const WIZARD_STEP_IDS: readonly CourseWizardStepId[] = WIZARD_STEPS.map(
  ({ id }) => id,
);

export const COURSE_WIZARD_ARROW_KEY_OWNER_SELECTOR = [
  '[role="dialog"]',
  '[role="grid"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="tab"]',
  '[role="tree"]',
].join(",");

export function getAdjacentWizardSteps(
  activeStep: CourseWizardStepId,
): Set<CourseWizardStepId> {
  const index = WIZARD_STEP_IDS.indexOf(activeStep);
  const mounted = new Set<CourseWizardStepId>([activeStep]);
  const previous = WIZARD_STEP_IDS[index - 1];
  const following = WIZARD_STEP_IDS[index + 1];
  if (previous) mounted.add(previous);
  if (following) mounted.add(following);
  return mounted;
}

export function parseWizardTab(
  rawParam: string | null | undefined,
): CourseWizardStepId | null {
  if (!rawParam) return null;
  const normalized = rawParam.toLowerCase().trim();
  if (
    normalized === "access" ||
    normalized === "accessrules" ||
    normalized === "access-rules"
  ) {
    return "access-rules";
  }
  if (WIZARD_STEPS.some((s) => s.id === normalized)) {
    return normalized as CourseWizardStepId;
  }
  return null;
}
