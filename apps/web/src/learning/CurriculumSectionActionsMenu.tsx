import { ArrowsInLineVerticalIcon as ArrowsInLineVertical } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowsOutLineVerticalIcon as ArrowsOutLineVertical } from "@phosphor-icons/react/ArrowsOutLineVertical";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import type { RefObject } from "react";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
} from "../components/ui/context-menu";

export interface CurriculumSectionActionsMenuContentProps {
  sectionIds: readonly number[];
  expandedSectionIds: readonly number[];
  onExpandAllSections: () => void;
  onCollapseAllSections: () => void;
  onOpenCourseOverview?: () => void;
  portalContainer?: RefObject<HTMLElement | null>;
  className?: string;
  ariaLabel?: string;
}

export function CurriculumSectionActionsMenuContent({
  sectionIds,
  expandedSectionIds,
  onExpandAllSections,
  onCollapseAllSections,
  onOpenCourseOverview,
  portalContainer,
  className = "w-max min-w-0",
  ariaLabel = "Course curriculum actions",
}: CurriculumSectionActionsMenuContentProps) {
  const allSectionsExpanded =
    sectionIds.length > 0 && expandedSectionIds.length === sectionIds.length;
  const allSectionsCollapsed = expandedSectionIds.length === 0;

  return (
    <ContextMenuContent
      aria-label={ariaLabel}
      className={className}
      portalContainer={portalContainer}
    >
      <ContextMenuGroup>
        {!allSectionsExpanded ? (
          <ContextMenuItem onClick={onExpandAllSections}>
            <ArrowsOutLineVertical aria-hidden="true" />
            Expand all sections
          </ContextMenuItem>
        ) : null}
        {!allSectionsCollapsed ? (
          <ContextMenuItem onClick={onCollapseAllSections}>
            <ArrowsInLineVertical aria-hidden="true" />
            Collapse all sections
          </ContextMenuItem>
        ) : null}
        {onOpenCourseOverview ? (
          <ContextMenuItem onClick={onOpenCourseOverview}>
            <Eye aria-hidden="true" />
            Adjust course overview
          </ContextMenuItem>
        ) : null}
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}
