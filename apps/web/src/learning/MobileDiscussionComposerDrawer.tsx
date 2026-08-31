import { useMemo, type CSSProperties } from "react";
import "../learning-interactions.css";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import { CommentComposer } from "./CommentComposer";
import type {
  DiscussionDraft,
  DiscussionEntryKind,
  DiscussionVisibility,
} from "./discussion-editor/types";

export interface MobileDiscussionComposerDrawerProps {
  open: boolean;
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  editingEntryId: number | null;
  invalid: boolean;
  canSubmit: boolean;
  collapsedSnapPoint: number;
  snapPoint: number | null;
  keyboardInset: number;
  viewportHeight: number | null;
  onOpen: () => void;
  onClose: () => void;
  onSnapPointChange: (snapPoint: number | null) => void;
  onDraftChange: (draft: DiscussionDraft) => void;
  onEntryKindChange: (entryKind: DiscussionEntryKind) => void;
  onVisibilityChange: (visibility: DiscussionVisibility) => void;
  onSubmit: () => void;
}

export function MobileDiscussionComposerDrawer({
  open,
  draft,
  entryKind,
  visibility,
  editingEntryId,
  invalid,
  canSubmit,
  collapsedSnapPoint,
  snapPoint,
  keyboardInset,
  viewportHeight,
  onOpen,
  onClose,
  onSnapPointChange,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
}: MobileDiscussionComposerDrawerProps) {
  const editing = editingEntryId !== null;
  const title = editing
    ? "Edit a discussion entry"
    : "Create a discussion entry";
  const snapPoints = useMemo(
    () => [collapsedSnapPoint, 1],
    [collapsedSnapPoint],
  );

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpen();
        else onClose();
      }}
      modal={false}
      snapPoints={snapPoints}
      snapPoint={snapPoint}
      onSnapPointChange={(nextSnapPoint) => {
        if (typeof nextSnapPoint === "number" || nextSnapPoint === null) {
          onSnapPointChange(nextSnapPoint);
        }
      }}
      snapToSequentialPoints
      showSwipeHandle
      swipeDirection="down"
      swipeHandleClassName="pt-2.5 after:w-18 after:bg-[color-mix(in_srgb,var(--text)_34%,transparent)]"
    >
      <DrawerContent
        data-comment-composer-container
        style={
          {
            "--drawer-content-height": viewportHeight
              ? `${viewportHeight}px`
              : "100dvh",
            "--drawer-content-max-height": viewportHeight
              ? `${viewportHeight}px`
              : "100dvh",
            bottom: `${keyboardInset}px`,
            paddingBottom:
              keyboardInset > 0 ? "0px" : "var(--app-safe-area-bottom)",
          } as CSSProperties
        }
        aria-label={title}
        className="learning-comment-composer-drawer overflow-hidden rounded-t-[22px]! bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] px-0 pt-0 shadow-[0_-20px_56px_rgba(0,0,0,0.42)] data-expanded:rounded-none!"
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">
          Write a comment, Q&amp;A, or note for this lesson.
        </DrawerDescription>
        <CommentComposer
          draft={draft}
          documentId={
            editing ? `discussion-edit-${editingEntryId}` : "discussion-new"
          }
          entryKind={entryKind}
          visibility={visibility}
          invalid={invalid}
          canSubmit={canSubmit}
          editing={editing}
          autoFocus
          presentation="drawer"
          onDraftChange={onDraftChange}
          onEntryKindChange={onEntryKindChange}
          onVisibilityChange={onVisibilityChange}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </DrawerContent>
    </Drawer>
  );
}
