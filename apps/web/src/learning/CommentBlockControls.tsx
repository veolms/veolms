import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import DragHandle from "@tiptap/extension-drag-handle-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CommentBlockMenu,
  type CommentBlockMenuHandle,
} from "./CommentBlockMenu";
import {
  COMMENT_BLOCK_COMMANDS,
  getBlockTextSelectionPosition,
  isCommentBlockCommandActive,
  runCommentBlockCommand,
  type CommentBlockCommand,
  type CommentBlockCommandId,
} from "./commentBlockCommands";

const DRAG_HANDLE_POSITION = {
  placement: "left-start" as const,
  strategy: "absolute" as const,
};

const NESTED_DRAG_HANDLE_OPTIONS = {
  edgeDetection: { threshold: -16 },
};

function setDragHandleLocked(editor: Editor, locked: boolean) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked));
}

interface SelectedBlock {
  node: ProseMirrorNode;
  pos: number;
}

interface OpenBlockMenu {
  anchor: HTMLElement;
  title: string;
  activeCommandId?: CommentBlockCommandId;
}

export function CommentBlockControls({ editor }: { editor: Editor }) {
  const selectedBlockRef = useRef<SelectedBlock | null>(null);
  const menuOpenRef = useRef(false);
  const addButtonReleaseCleanupRef = useRef<() => void>(() => undefined);
  const addButtonReleaseTimerRef = useRef<number | null>(null);
  const [menu, setMenu] = useState<OpenBlockMenu | null>(null);

  const closeMenu = useCallback(() => {
    menuOpenRef.current = false;
    setMenu(null);
    setDragHandleLocked(editor, false);
  }, [editor]);

  useEffect(
    () => () => {
      addButtonReleaseCleanupRef.current();
      if (addButtonReleaseTimerRef.current !== null) {
        window.clearTimeout(addButtonReleaseTimerRef.current);
      }
      setDragHandleLocked(editor, false);
    },
    [editor],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof document.createRange().getClientRects !== "function")
      return undefined;

    let animationFrame = 0;
    const revealHandleForSelection = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const coordinates = editor.view.coordsAtPos(
          editor.state.selection.from,
        );
        editor.view.dom.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            clientX: coordinates.left + 4,
            clientY: (coordinates.top + coordinates.bottom) / 2,
          }),
        );
      });
    };

    editor.on("focus", revealHandleForSelection);
    editor.on("selectionUpdate", revealHandleForSelection);
    return () => {
      cancelAnimationFrame(animationFrame);
      editor.off("focus", revealHandleForSelection);
      editor.off("selectionUpdate", revealHandleForSelection);
    };
  }, [editor]);

  const getActiveCommandId = useCallback(
    () =>
      COMMENT_BLOCK_COMMANDS.find((command) =>
        isCommentBlockCommandActive(editor, command.id),
      )?.id,
    [editor],
  );

  const openAddMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const selectedBlock = selectedBlockRef.current;
    if (!selectedBlock) return;

    const insertPosition = Math.min(
      selectedBlock.pos + selectedBlock.node.nodeSize,
      editor.state.doc.content.size,
    );
    const isListItem = selectedBlock.node.type.name === "listItem";
    const insertedBlock = isListItem
      ? { type: "listItem", content: [{ type: "paragraph" }] }
      : { type: "paragraph" };
    const selectionPosition = insertPosition + (isListItem ? 2 : 1);

    editor
      .chain()
      .focus()
      .insertContentAt(insertPosition, insertedBlock)
      .setTextSelection(selectionPosition)
      .run();
    setDragHandleLocked(editor, true);
    menuOpenRef.current = true;
    setMenu({
      anchor: event.currentTarget,
      title: "Add a block",
      activeCommandId: "text",
    });
  };

  const openTransformMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const selectedBlock = selectedBlockRef.current;
    if (!selectedBlock) return;

    if (!selectedBlock.node.isTextblock && selectedBlock.node.isLeaf) {
      editor.commands.setNodeSelection(selectedBlock.pos);
    } else {
      editor.commands.setTextSelection(
        getBlockTextSelectionPosition(selectedBlock.node, selectedBlock.pos),
      );
    }
    setDragHandleLocked(editor, true);
    menuOpenRef.current = true;
    setMenu({
      anchor: event.currentTarget,
      title: "Turn into",
      activeCommandId: getActiveCommandId(),
    });
  };

  const runCommand = (command: CommentBlockCommand) => {
    runCommentBlockCommand({ editor, commandId: command.id });
    closeMenu();
  };

  return (
    <>
      <DragHandle
        editor={editor}
        nested={NESTED_DRAG_HANDLE_OPTIONS}
        computePositionConfig={DRAG_HANDLE_POSITION}
        className="group/comment-block-handle flex h-7 translate-x-1 -translate-y-0.5 items-center gap-0 rounded-md text-(--muted) data-[dragging=true]:cursor-grabbing"
        onNodeChange={({ node, pos }) => {
          selectedBlockRef.current = node ? { node, pos } : null;
        }}
        onElementDragStart={() => {
          menuOpenRef.current = false;
          setMenu(null);
        }}
      >
        <button
          type="button"
          title="Add block"
          aria-label="Add block"
          aria-haspopup="listbox"
          aria-expanded={menu?.title === "Add a block"}
          className="grid size-6 place-items-center rounded text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) sm:size-7"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragHandleLocked(editor, true);

            addButtonReleaseCleanupRef.current();
            const release = () => {
              window.removeEventListener("mouseup", release);
              addButtonReleaseCleanupRef.current = () => undefined;
              addButtonReleaseTimerRef.current = window.setTimeout(() => {
                addButtonReleaseTimerRef.current = null;
                if (!menuOpenRef.current) {
                  setDragHandleLocked(editor, false);
                }
              }, 0);
            };
            addButtonReleaseCleanupRef.current = () =>
              window.removeEventListener("mouseup", release);
            window.addEventListener("mouseup", release, { once: true });
          }}
          onClick={openAddMenu}
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Drag to move or click to change block"
          aria-label="Drag block to reorder or change its type"
          aria-haspopup="listbox"
          aria-expanded={menu?.title === "Turn into"}
          className="grid size-6 cursor-grab place-items-center rounded text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) sm:size-7"
          onClick={openTransformMenu}
        >
          <DotsSixVertical size={17} weight="bold" aria-hidden="true" />
        </button>
      </DragHandle>

      {menu && (
        <BlockMenuPopover
          menu={menu}
          editor={editor}
          onSelect={runCommand}
          onClose={closeMenu}
        />
      )}
    </>
  );
}

function BlockMenuPopover({
  menu,
  editor,
  onSelect,
  onClose,
}: {
  menu: OpenBlockMenu;
  editor: Editor;
  onSelect: (command: CommentBlockCommand) => void;
  onClose: () => void;
}) {
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<CommentBlockMenuHandle>(null);
  const [position, setPosition] = useState<CSSProperties>();

  const updatePosition = useCallback(() => {
    if (!menu.anchor.isConnected) {
      onClose();
      return;
    }

    const anchorRect = menu.anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const width = Math.min(304, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, anchorRect.left),
      window.innerWidth - viewportPadding - width,
    );
    const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding;
    const spaceAbove = anchorRect.top - viewportPadding;
    const openAbove = spaceBelow < 280 && spaceAbove > spaceBelow;

    setPosition({
      position: "fixed",
      zIndex: 220,
      left,
      top: openAbove ? anchorRect.top - gap : anchorRect.bottom + gap,
      width,
      maxHeight: Math.max(
        160,
        Math.min(360, openAbove ? spaceAbove : spaceBelow),
      ),
      overflow: "hidden",
      transform: openAbove ? "translateY(-100%)" : undefined,
      transformOrigin: openAbove ? "bottom left" : "top left",
    });
  }, [menu.anchor, onClose]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menu.anchor.contains(target) ||
        menuContainerRef.current?.contains(target)
      )
        return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        editor.commands.focus();
        return;
      }

      if (menuRef.current?.onKeyDown(event)) event.preventDefault();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [editor.commands, menu.anchor, onClose, updatePosition]);

  return createPortal(
    <div ref={menuContainerRef} style={position}>
      <CommentBlockMenu
        ref={menuRef}
        items={COMMENT_BLOCK_COMMANDS}
        activeCommandId={menu.activeCommandId}
        title={menu.title}
        maxHeight={position?.maxHeight}
        onSelect={onSelect}
      />
    </div>,
    document.body,
  );
}
