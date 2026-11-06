import { useState, type DragEvent } from "react";
import { moveCourseTo, sameOrder } from "./courseOrder";

const DRAG_TYPE = "application/x-veolms-course";

export interface CourseDragHandlers {
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/**
 * Courses reordered by dragging one onto another's place. While a course is
 * dragged the list shows where it would land; dropping it hands the new
 * order to `onCommit`, and leaving it anywhere else puts everything back.
 */
export function useCourseDragOrder(
  ids: readonly string[],
  onCommit: (ids: string[]) => void,
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const order = preview ?? ids;

  const reset = () => {
    setDraggedId(null);
    setPreview(null);
  };

  const handlersFor = (id: string, label: string): CourseDragHandlers => ({
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = "move";
      // A link inside the card would carry its address; the course is what
      // moves.
      event.dataTransfer.clearData();
      event.dataTransfer.setData(DRAG_TYPE, id);
      event.dataTransfer.setData("text/plain", label);
      const card = event.currentTarget;
      const box = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        card,
        event.clientX - box.left,
        event.clientY - box.top,
      );
      setDraggedId(id);
      setPreview([...ids]);
    },
    onDragOver: (event) => {
      if (!draggedId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (id === draggedId) return;
      setPreview((current) => {
        const next = moveCourseTo(current ?? ids, draggedId, id);
        return current && sameOrder(current, next) ? current : next;
      });
    },
    onDrop: (event) => {
      if (!draggedId) return;
      event.preventDefault();
      const next = preview ?? ids;
      reset();
      if (!sameOrder(next, ids)) onCommit([...next]);
    },
    onDragEnd: reset,
  });

  return { order, draggedId, handlersFor };
}
