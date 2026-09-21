import { useState } from "react";
import { BellSimpleIcon as BellSimple } from "@phosphor-icons/react/BellSimple";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { CopySimpleIcon as CopySimple } from "@phosphor-icons/react/CopySimple";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { CourseActionMenu, MenuAction, MenuDivider } from "../courses";
import type { DiscussionWorkspaceCard } from "./discussions-workspace.adapter";
import { useDiscussionWorkspaceCardActions } from "./useDiscussionWorkspaceCardActions";

interface DiscussionWorkspaceActionMenuProps {
  card: DiscussionWorkspaceCard;
  destination: string | null;
  setNotice?: (message: string) => void;
}

export function DiscussionWorkspaceActionMenu({
  card,
  destination,
  setNotice,
}: DiscussionWorkspaceActionMenuProps) {
  const [open, setOpen] = useState(false);
  const actions = useDiscussionWorkspaceCardActions({
    card,
    destination,
    setNotice,
  });

  const sourceLabel = actions.isNote ? "note" : "discussion";

  return (
    <CourseActionMenu
      open={open}
      onOpenChange={setOpen}
      dismissOnScroll
      ariaLabel={`More actions for ${sourceLabel}`}
      menuLabel={`${actions.isNote ? "Note" : "Discussion"} actions`}
      className="relative z-20 ml-auto shrink-0"
      triggerClassName="size-9"
      triggerVisualClassName="size-7"
    >
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
      {actions.canBookmark && actions.canCopyLink && <MenuDivider />}
      {actions.canCopyLink && (
        <MenuAction
          Icon={LinkSimple}
          label="Copy link"
          onClick={() => {
            void actions.copyLink();
          }}
        />
      )}
      {actions.canCopyText && (
        <MenuAction
          Icon={CopySimple}
          label="Copy text"
          onClick={() => {
            void actions.copyText();
          }}
        />
      )}
    </CourseActionMenu>
  );
}
