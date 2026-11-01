import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Info } from "@phosphor-icons/react/Info";
import { Link } from "@phosphor-icons/react/Link";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XCircle } from "@phosphor-icons/react/XCircle";
import { X } from "@phosphor-icons/react/X";

export type ToastType = "success" | "info" | "warning" | "error";
export type ToastIcon = "default" | "link";

export interface ToastNotice {
  message: string;
  title?: string;
  type?: ToastType;
  icon?: ToastIcon;
}

export type ToastMessage = string | ToastNotice;

export interface ToastNotificationProps {
  message: ToastMessage | null;
  onDismiss?: () => void;
  duration?: number;
  type?: ToastType;
}

const normalizeNotice = (
  message: ToastMessage | null,
  fallbackType: ToastType,
): ToastNotice | null => {
  if (!message) return null;
  return typeof message === "string"
    ? { message, type: fallbackType }
    : { ...message, type: message.type ?? fallbackType };
};

export function ToastNotification({
  message,
  onDismiss,
  duration = 3200,
  type = "info",
}: ToastNotificationProps) {
  const [currentNotice, setCurrentNotice] = useState<ToastNotice | null>(() =>
    normalizeNotice(message, type),
  );
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const remainingTimeRef = useRef(duration);
  const startTimeRef = useRef<number>(Date.now());

  const handleStartExit = () => {
    setIsExiting(true);
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = window.setTimeout(() => {
      setCurrentNotice(null);
      setIsExiting(false);
      onDismiss?.();
    }, 240); // Matches toastSlideOut duration
  };

  // Handle incoming message changes
  useEffect(() => {
    if (message) {
      setCurrentNotice(normalizeNotice(message, type));
      setIsExiting(false);
      setIsPaused(false);
      remainingTimeRef.current = duration;
      startTimeRef.current = Date.now();

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        handleStartExit();
      }, duration);
    } else if (currentNotice && !isExiting) {
      handleStartExit();
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, [message, duration, type]);

  const handleMouseEnter = () => {
    isPausedRef.current = true;
    setIsPaused(true);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(
        800,
        remainingTimeRef.current - elapsed,
      );
    }
  };

  const handleMouseLeave = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    startTimeRef.current = Date.now();
    if (!isExiting && currentNotice) {
      timerRef.current = window.setTimeout(() => {
        handleStartExit();
      }, remainingTimeRef.current);
    }
  };

  // A touch swipe left, right or up sends the toast away. It follows the
  // finger (the CSS `translate` property, which adds to the entry
  // animation's transform rather than replacing it) and springs back when
  // let go too soon.
  const toastRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  const setSwipeOffset = (dx: number, dy: number, animate: boolean) => {
    const element = toastRef.current;
    if (!element) return;
    element.style.transition = animate
      ? "translate 180ms ease-out, opacity 180ms ease-out"
      : "none";
    element.style.translate = dx || dy ? `${dx}px ${dy}px` : "";
    element.style.opacity =
      dx || dy ? String(Math.max(0.2, 1 - Math.hypot(dx, dy) / 260)) : "";
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || isExiting) return;
    if ((event.target as Element).closest("button")) return;
    swipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    handleMouseEnter();
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipe.dx = event.clientX - swipe.x;
    // Up only: pulling down gives a little and comes back.
    const rawDy = event.clientY - swipe.y;
    swipe.dy = rawDy < 0 ? rawDy : rawDy * 0.2;
    setSwipeOffset(swipe.dx, swipe.dy, false);
  };
  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    const away = Math.abs(swipe.dx) > 70 || swipe.dy < -36;
    if (!away) {
      setSwipeOffset(0, 0, true);
      handleMouseLeave();
      return;
    }
    const element = toastRef.current;
    const width = element?.offsetWidth ?? 320;
    const flingX =
      Math.abs(swipe.dx) > 70 ? Math.sign(swipe.dx) * (width + 40) : 0;
    const flingY = flingX ? swipe.dy : -((element?.offsetHeight ?? 60) + 60);
    setSwipeOffset(flingX, flingY, true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => {
      setCurrentNotice(null);
      setIsExiting(false);
      onDismiss?.();
    }, 180);
  };

  if (!currentNotice) {
    return null;
  }

  const currentType = currentNotice.type ?? type;

  const renderIcon = () => {
    if (currentNotice.icon === "link") {
      return <Link size={22} weight="bold" />;
    }

    switch (currentType) {
      case "success":
        return <CheckCircle size={17} weight="fill" />;
      case "error":
        return <XCircle size={17} weight="fill" />;
      case "warning":
        return <WarningCircle size={17} weight="fill" />;
      case "info":
      default:
        return <Info size={17} weight="fill" />;
    }
  };

  return (
    <div
      className={`toast-notification toast-notification--${currentType} ${currentNotice.title ? "is-detailed" : ""} ${isExiting ? "is-exiting" : ""} ${isPaused ? "is-paused" : ""}`}
      ref={toastRef}
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div className="toast-notification__icon-wrap" aria-hidden="true">
        {renderIcon()}
      </div>
      {currentNotice.title && (
        <div className="toast-notification__divider" aria-hidden="true" />
      )}
      <div className="toast-notification__content">
        {currentNotice.title && (
          <div className="toast-notification__title">{currentNotice.title}</div>
        )}
        <div className="toast-notification__message">
          {currentNotice.message}
        </div>
      </div>
      <button
        type="button"
        className="toast-notification__close"
        onClick={handleStartExit}
        aria-label="Dismiss notification"
        title="Dismiss"
      >
        <X size={13} weight="bold" />
      </button>
    </div>
  );
}
