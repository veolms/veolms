import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CheckCircle,
  Info,
  WarningCircle,
  XCircle,
  X,
} from "@phosphor-icons/react";

export type ToastType = "success" | "info" | "warning" | "error";

export interface ToastNotificationProps {
  message: string | null;
  onDismiss?: () => void;
  duration?: number;
  type?: ToastType;
}

export function ToastNotification({
  message,
  onDismiss,
  duration = 3200,
  type = "info",
}: ToastNotificationProps) {
  const [currentMessage, setCurrentMessage] = useState<string | null>(message);
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
      setCurrentMessage(message);
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
    } else if (currentMessage && !isExiting) {
      handleStartExit();
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, [message, duration]);

  const handleStartExit = () => {
    setIsExiting(true);
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = window.setTimeout(() => {
      setCurrentMessage(null);
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
      remainingTimeRef.current = Math.max(800, remainingTimeRef.current - elapsed);
    }
  };

  const handleMouseLeave = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    startTimeRef.current = Date.now();
    if (!isExiting && currentMessage) {
      timerRef.current = window.setTimeout(() => {
        handleStartExit();
      }, remainingTimeRef.current);
    }
  };

  if (!currentMessage) {
    return null;
  }

  const renderIcon = () => {
    switch (type) {
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
      className={`toast-notification toast-notification--${type} ${isExiting ? "is-exiting" : ""} ${isPaused ? "is-paused" : ""}`}
      style={customStyle}
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="toast-notification__icon-wrap" aria-hidden="true">
        {renderIcon()}
      </div>
      <div className="toast-notification__message">{currentMessage}</div>
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
