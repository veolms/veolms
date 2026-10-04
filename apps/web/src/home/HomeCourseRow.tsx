import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "../styles/features/guest-home.css";

interface HomeCourseRowProps {
  children: ReactNode;
  id: string;
  label: string;
  isBusy?: boolean;
  viewportClassName?: string;
}

interface HomeCourseRowScrollState {
  canScrollPrevious: boolean;
  canScrollNext: boolean;
}

const INITIAL_SCROLL_STATE: HomeCourseRowScrollState = {
  canScrollPrevious: false,
  canScrollNext: false,
};

function getScrollStep(row: HTMLDivElement) {
  const firstCard = row.firstElementChild;
  if (!(firstCard instanceof HTMLElement)) {
    return Math.max(row.clientWidth * 0.85, 1);
  }

  const firstCardRect = firstCard.getBoundingClientRect();
  const nextCard = firstCard.nextElementSibling;
  const nextCardRect =
    nextCard instanceof HTMLElement ? nextCard.getBoundingClientRect() : null;
  const gap = nextCardRect
    ? Math.max(0, nextCardRect.left - firstCardRect.right)
    : 0;
  const cardWidth = firstCardRect.width;
  return Math.max(cardWidth + gap, 1);
}

export function HomeCourseRow({
  children,
  id,
  label,
  isBusy = false,
  viewportClassName,
}: HomeCourseRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState(INITIAL_SCROLL_STATE);

  const updateScrollState = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;

    const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
    const nextState = {
      canScrollPrevious: row.scrollLeft > 1,
      canScrollNext: row.scrollLeft < maxScrollLeft - 1,
    };

    setScrollState((current) =>
      current.canScrollPrevious === nextState.canScrollPrevious &&
      current.canScrollNext === nextState.canScrollNext
        ? current
        : nextState,
    );
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;

    const frame = window.requestAnimationFrame(updateScrollState);
    row.addEventListener("scroll", updateScrollState, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(row);

    return () => {
      window.cancelAnimationFrame(frame);
      row.removeEventListener("scroll", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [children, updateScrollState]);

  const scrollByCard = (direction: -1 | 1) => {
    const row = rowRef.current;
    if (!row) return;

    row.scrollBy({
      left: direction * getScrollStep(row),
      behavior: "smooth",
    });
  };

  return (
    <div className="home-course-row">
      <div className="home-course-row__viewport-shell">
        <div
          ref={rowRef}
          id={id}
          className={["home-course-row__viewport", viewportClassName]
            .filter(Boolean)
            .join(" ")}
          data-course-catalogue-grid
          aria-busy={isBusy}
          aria-label={label + " courses"}
        >
          {children}
        </div>

        <button
          type="button"
          className="home-course-row__control home-course-row__control--previous"
          data-triple-tap-ignore=""
          aria-label={"Scroll " + label + " courses left"}
          aria-controls={id}
          disabled={!scrollState.canScrollPrevious}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            scrollByCard(-1);
          }}
        >
          <span className="home-course-row__control-circle" aria-hidden="true">
            <CaretLeft size={20} weight="bold" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          className="home-course-row__control home-course-row__control--next"
          data-triple-tap-ignore=""
          aria-label={"Scroll " + label + " courses right"}
          aria-controls={id}
          disabled={!scrollState.canScrollNext}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            scrollByCard(1);
          }}
        >
          <span className="home-course-row__control-circle" aria-hidden="true">
            <CaretRight size={20} weight="bold" aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}
