import { useState } from "react";
import { BellSimpleIcon as BellSimple } from "@phosphor-icons/react/BellSimple";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { CopySimpleIcon as CopySimple } from "@phosphor-icons/react/CopySimple";
import { MarkdownLogoIcon as MarkdownLogo } from "@phosphor-icons/react/MarkdownLogo";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { CourseActionMenu, MenuAction, MenuDivider } from "../courses";
import type { NavigateTo } from "../routing/navigation";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";
import { useDiscussionWorkspaceCardActions } from "./useDiscussionWorkspaceCardActions";
import { DiscussionTextSizeMenuItem } from "./DiscussionTextSizeControl";

interface DiscussionWorkspaceActionMenuProps {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  setNotice?: (message: string) => void;
  /** Given, the menu starts with "Open in course". */
  onNavigatePage?: NavigateTo;
  /** Opens the post in the side panel with its text being edited. */
  onEdit?: (card: DiscussionWorkspaceCard) => void;
  onReport?: (card: DiscussionWorkspaceCard) => void;
  /** The side panel's menu also sets the size of the text it shows. */
  textSize?: boolean;
}

export function DiscussionWorkspaceActionMenu({
  card,
  destination,
  setNotice,
  onNavigatePage,
  onEdit,
  onReport,
  textSize = false,
}: DiscussionWorkspaceActionMenuProps) {
  const [open, setOpen] = useState(false);
  const actions = useDiscussionWorkspaceCardActions({
    card,
    destination,
    setNotice,
  });

  const sourceLabel = actions.isNote ? "note" : "discussion";
  const canEdit = actions.canEdit && Boolean(onEdit);
  const canReport = actions.canReport && Boolean(onReport);

  return (
    <CourseActionMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) actions.resetDelete();
      }}
      dismissOnScroll
      ariaLabel={`More actions for ${sourceLabel}`}
      menuLabel={`${actions.isNote ? "Note" : "Discussion"} actions`}
      className="relative z-20 ml-auto shrink-0"
      triggerClassName="size-9"
      triggerVisualClassName="size-7"
    >
      {onNavigatePage && destination && (
        <MenuAction
          Icon={Play}
          label="Open in course"
          onClick={() => onNavigatePage(destination, { exact: true })}
        />
      )}
      {canEdit && (
        <MenuAction
          Icon={PencilSimple}
          label={actions.editLabel}
          onClick={() => onEdit?.(card)}
        />
      )}
      {actions.canCopyLink && (
        <MenuAction
          Icon={LinkSimple}
          label="Copy link"
          onClick={() => {
            void actions.copyLink();
          }}
        />
      )}
      {actions.canBookmark && (
        <MenuAction
          Icon={BookmarkSimple}
          label={actions.bookmarkLabel}
          onClick={actions.bookmark}
        />
      )}
      {actions.canFollow && (
        <MenuAction
          Icon={BellSimple}
          label={actions.followLabel}
          onClick={actions.follow}
        />
      )}
      {actions.canCopyText && (
        <>
          <MenuAction
            Icon={CopySimple}
            label="Copy text"
            onClick={() => {
              void actions.copyText();
            }}
          />
          <MenuAction
            Icon={MarkdownLogo}
            label="Copy Markdown"
            onClick={() => {
              void actions.copyMarkdown();
            }}
          />
        </>
      )}
      {textSize && <DiscussionTextSizeMenuItem />}
      {(canReport || actions.canHide || actions.canDelete) && <MenuDivider />}
      {canReport && (
        <MenuAction
          Icon={Flag}
          label={actions.reportLabel}
          onClick={() => onReport?.(card)}
        />
      )}
      {actions.canHide && (
        <MenuAction
          Icon={actions.isHidden ? Eye : EyeSlash}
          label={actions.hideLabel}
          onClick={actions.isHidden ? actions.unhide : actions.hide}
        />
      )}
      {actions.canDelete && (
        <>
          <MenuAction
            Icon={Trash}
            label={actions.deleteLabel}
            destructive
            // The first press only asks for confirmation, so the menu stays.
            stayOpenMs={actions.confirmingDelete ? undefined : 4000}
            onClick={actions.deleteItem}
          />
        </>
      )}
    </CourseActionMenu>
  );
}
