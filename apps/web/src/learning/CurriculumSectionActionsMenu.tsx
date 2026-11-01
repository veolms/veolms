import { ArrowsInLineVerticalIcon as ArrowsInLineVertical } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowsOutLineVerticalIcon as ArrowsOutLineVertical } from "@phosphor-icons/react/ArrowsOutLineVertical";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { PushPinSimpleIcon as PushPinSimple } from "@phosphor-icons/react/PushPinSimple";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import type { ReactNode, RefObject } from "react";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSwitchItem,
} from "../components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  updateLearningPreferences,
  type LearningPreferences,
} from "../settings/settingsPreferences";
import { useLearningPreferenceValue } from "./useLearningPreferenceValue";

/** What can be done to the curriculum as a whole. */
export interface CurriculumActionsOptions {
  sectionIds: readonly number[];
  expandedSectionIds: readonly number[];
  /** The section of the lesson being played. */
  currentSectionId?: number;
  onExpandAllSections: () => void;
  onCollapseAllSections: () => void;
  /** Closes every section but the one being played. */
  onCollapseOtherSections?: () => void;
}

interface CurriculumAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

/** The learning settings that are on or off. */
type BooleanLearningPreference = {
  [K in keyof LearningPreferences]: LearningPreferences[K] extends boolean
    ? K
    : never;
}[keyof LearningPreferences];

/** A learning setting drawn as a switch in the menus. */
interface CurriculumSetting {
  key: BooleanLearningPreference;
  icon: ReactNode;
  /** Short, as a menu row must be; the settings page explains it in full. */
  label: string;
}

/**
 * The settings the menus switch: whether an open section's heading holds to
 * the top of the panel. Each is the learning setting itself, so the settings
 * page and every list follow.
 */
const CURRICULUM_SETTINGS: readonly CurriculumSetting[] = [
  {
    key: "stickOpenSection",
    icon: <PushPinSimple aria-hidden="true" />,
    label: "Stick open section",
  },
];

function useCurriculumSetting(key: BooleanLearningPreference) {
  const value = useLearningPreferenceValue(key);
  const setValue = (next: boolean) =>
    updateLearningPreferences({ [key]: next });
  return [value, setValue] as const;
}

/**
 * The actions that apply right now, in order: opening every section (unless
 * all are open), closing them (unless all are closed), and closing all but
 * the one being played (while another is open). The panel's context menu
 * and its ⋯ menu list the same ones, with the settings under them.
 */
function getCurriculumActions({
  sectionIds,
  expandedSectionIds,
  currentSectionId,
  onExpandAllSections,
  onCollapseAllSections,
  onCollapseOtherSections,
}: CurriculumActionsOptions): CurriculumAction[] {
  const allSectionsExpanded =
    sectionIds.length > 0 && expandedSectionIds.length === sectionIds.length;
  const allSectionsCollapsed = expandedSectionIds.length === 0;
  const otherSectionsExpanded =
    currentSectionId !== undefined &&
    onCollapseOtherSections !== undefined &&
    expandedSectionIds.some((id) => id !== currentSectionId);
  const actions: CurriculumAction[] = [];
  if (!allSectionsExpanded) {
    actions.push({
      id: "expand-all",
      icon: <ArrowsOutLineVertical aria-hidden="true" />,
      label: "Expand all sections",
      onClick: onExpandAllSections,
    });
  }
  if (!allSectionsCollapsed) {
    actions.push({
      id: "collapse-all",
      icon: <ArrowsInLineVertical aria-hidden="true" />,
      label: "Collapse all sections",
      onClick: onCollapseAllSections,
    });
  }
  if (otherSectionsExpanded && onCollapseOtherSections) {
    actions.push({
      id: "collapse-others",
      icon: <Target aria-hidden="true" />,
      label: "Collapse other sections",
      onClick: onCollapseOtherSections,
    });
  }
  return actions;
}

/** One setting as a switch row of the context menu. */
function ContextMenuSettingRow({ setting }: { setting: CurriculumSetting }) {
  const [value, setValue] = useCurriculumSetting(setting.key);
  return (
    <ContextMenuSwitchItem checked={value} onCheckedChange={setValue}>
      {setting.icon}
      {setting.label}
    </ContextMenuSwitchItem>
  );
}

/** One setting as a switch row of the ⋯ menu. */
function DropdownMenuSettingRow({ setting }: { setting: CurriculumSetting }) {
  const [value, setValue] = useCurriculumSetting(setting.key);
  return (
    <DropdownMenuSwitchItem checked={value} onCheckedChange={setValue}>
      {setting.icon}
      {setting.label}
    </DropdownMenuSwitchItem>
  );
}

export interface CurriculumSectionActionsMenuContentProps extends CurriculumActionsOptions {
  portalContainer?: RefObject<HTMLElement | null>;
  className?: string;
  ariaLabel?: string;
}

/** The actions as the panel's context menu (a right click anywhere on it). */
export function CurriculumSectionActionsMenuContent({
  portalContainer,
  className = "w-max min-w-0",
  ariaLabel = "Course curriculum actions",
  ...options
}: CurriculumSectionActionsMenuContentProps) {
  return (
    <ContextMenuContent
      aria-label={ariaLabel}
      className={className}
      portalContainer={portalContainer}
    >
      <ContextMenuGroup>
        {getCurriculumActions(options).map((action) => (
          <ContextMenuItem key={action.id} onClick={action.onClick}>
            {action.icon}
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        {CURRICULUM_SETTINGS.map((setting) => (
          <ContextMenuSettingRow key={setting.key} setting={setting} />
        ))}
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}

export interface CurriculumActionsMenuProps extends CurriculumActionsOptions {
  portalContainer?: RefObject<HTMLElement | null>;
  /** The ⋯ button; the panel's head dresses it like its search button. */
  triggerClassName?: string;
}

/** The same actions behind a ⋯ button, for those who do not right-click. */
export function CurriculumActionsMenu({
  portalContainer,
  triggerClassName = "",
  ...options
}: CurriculumActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerClassName}
        aria-label="Course curriculum actions"
        title="More"
      >
        <DotsThreeVertical size={22} weight="bold" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label="Course curriculum actions"
        className="w-max min-w-0"
        portalContainer={portalContainer}
      >
        <DropdownMenuGroup>
          {getCurriculumActions(options).map((action) => (
            <DropdownMenuItem key={action.id} onClick={action.onClick}>
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {CURRICULUM_SETTINGS.map((setting) => (
            <DropdownMenuSettingRow key={setting.key} setting={setting} />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
