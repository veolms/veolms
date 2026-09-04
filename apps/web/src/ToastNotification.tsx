import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CheckCircle,
  Info,
  Link,
  WarningCircle,
  XCircle,
  X,
} from "@phosphor-icons/react";

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

  const customStyle: CSSProperties = {
    "--toast-duration": `${duration}ms`,
  } as CSSProperties;

  return (
    <div
      className={`toast-notification toast-notification--${currentType} ${currentNotice.title ? "is-detailed" : ""} ${isExiting ? "is-exiting" : ""} ${isPaused ? "is-paused" : ""}`}
      style={customStyle}
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

      {/* Time Progress Bar */}
      <div className="toast-notification__progress-track" aria-hidden="true">
        <div className="toast-notification__progress-fill" />
      </div>
    </div>
  );
}
