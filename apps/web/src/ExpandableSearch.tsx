import { ArrowLeftIcon as ArrowLeft, MagnifyingGlassIcon as MagnifyingGlass, XIcon as X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "./searchShortcut";

interface ExpandableSearchProps {
  children: ReactNode;
  inputId: string;
  fieldId?: string;
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persistentDesktop?: boolean;
  overlay?: boolean;
  shortcutPriority?: boolean;
  clearOnBack?: boolean;
  backLabel?: string;
  className?: string;
  triggerClassName?: string;
  triggerIconSize?: number;
  backButtonClassName?: string;
}

export function ExpandableSearch({
  children,
  inputId,
  fieldId,
  label,
  placeholder,
  value,
  onValueChange,
  open,
  onOpenChange,
  persistentDesktop = false,
  overlay = false,
  shortcutPriority = false,
  clearOnBack = false,
  backLabel = "Back from search",
  className = "",
  triggerClassName = "",
  triggerIconSize = 23.75,
  backButtonClassName = "",
}: ExpandableSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const persistentRootClass = persistentDesktop ? "min-[900px]:contents" : "";
  const persistentIdleClass = persistentDesktop
    ? "min-[821px]:visible min-[900px]:contents"
    : "";
  const persistentTriggerClass = persistentDesktop ? "min-[821px]:hidden" : "";
  const persistentShellClass = persistentDesktop
    ? "min-[821px]:visible min-[821px]:static min-[821px]:h-11 min-[821px]:w-full min-[821px]:translate-y-0 min-[821px]:scale-x-100 min-[821px]:opacity-100 min-[900px]:order-2 min-[900px]:w-[320px] min-[900px]:max-w-[32vw] min-[900px]:shrink-0"
    : "";
  const persistentBackClass = persistentDesktop ? "min-[821px]:hidden" : "";
  const persistentFieldClass = persistentDesktop
    ? "min-[821px]:h-11 min-[821px]:rounded-(--control-radius-structured) min-[821px]:border-[color-mix(in_srgb,var(--text)_20%,transparent)] min-[821px]:bg-(--surface) min-[821px]:shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_18%,transparent)] min-[821px]:hover:border-[color-mix(in_srgb,var(--text)_32%,transparent)] min-[821px]:focus-within:border-(--accent) min-[821px]:focus-within:shadow-[0_8px_24px_color-mix(in_srgb,var(--accent-shadow)_28%,transparent)]"
    : "";
  const foregroundClass = overlay
    ? "text-white/80 hover:text-white active:text-white"
    : "text-(--text) hover:text-(--accent) active:text-(--accent-hover)";
  const fieldClass = overlay
    ? "bg-[rgba(5,10,20,0.58)] text-white focus-within:bg-[rgba(5,10,20,0.76)]"
    : "bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] text-(--muted) focus-within:bg-(--surface-strong)";
  const inputClass = overlay
    ? "text-white caret-white placeholder:text-white/60"
    : "text-(--text) caret-(--text) placeholder:text-(--muted)";
  const inputVisibilityClass = open
    ? "visible"
    : persistentDesktop
      ? "invisible min-[821px]:visible"
      : "invisible";

  useEffect(() => {
    if (!open) return undefined;
    const focusInput = () => {
      const root = rootRef.current;
      if (!root || root.getClientRects().length === 0) return;
      const rootStyles = window.getComputedStyle(root);
      const rootBounds = root.getBoundingClientRect();
      if (
        rootStyles.display === "none" ||
        rootStyles.visibility === "hidden" ||
        rootBounds.right <= 0 ||
        rootBounds.bottom <= 0 ||
        rootBounds.left >= window.innerWidth ||
        rootBounds.top >= window.innerHeight
      ) {
        return;
      }
      inputRef.current?.focus();
      const inputLength = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(inputLength, inputLength);
    };
    focusInput();
    const nextFrameTimer = window.setTimeout(focusInput, 0);
    const settledTimer = window.setTimeout(focusInput, 220);
    return () => {
      window.clearTimeout(nextFrameTimer);
      window.clearTimeout(settledTimer);
    };
  }, [open]);

  const closeSearch = () => {
    if (clearOnBack) onValueChange("");
    onOpenChange(false);
  };

  const openSearch = () => {
    if (!open) flushSync(() => onOpenChange(true));
    inputRef.current?.focus();
    const inputLength = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(inputLength, inputLength);
  };

  return (
    <div
      ref={rootRef}
      className={`relative flex min-w-0 flex-1 flex-col gap-4 ${persistentRootClass} ${className}`.trim()}
      data-expandable-search
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
      }}
    >
      <div
        className={`${open ? "invisible" : "visible"} flex min-w-0 flex-1 items-center justify-between gap-3 ${persistentIdleClass}`.trim()}
        data-expandable-search-idle
      >
        {children}
        <button
          type="button"
          className={`flex size-11 shrink-0 items-center justify-center border-0! bg-transparent! shadow-none! transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${foregroundClass} ${persistentTriggerClass} ${triggerClassName}`.trim()}
          aria-label={label}
          aria-expanded={open}
          aria-controls={inputId}
          title={label}
          onClick={openSearch}
        >
          <MagnifyingGlass
            size={triggerIconSize}
            weight="bold"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        className={`${open ? "visible scale-x-100 opacity-100" : "invisible scale-x-0 opacity-0"} absolute inset-x-0 top-1/2 z-20 flex min-w-0 -translate-y-1/2 origin-right items-center gap-2 bg-transparent transition-[transform,opacity] duration-200 ease-out ${persistentShellClass}`.trim()}
        data-mobile-search-shell
        data-expandable-search-shell
      >
        <button
          type="button"
          className={`flex size-10 shrink-0 items-center justify-center rounded-full border-0! bg-transparent! shadow-none! transition-colors hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)] active:bg-[color-mix(in_srgb,currentColor_18%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${foregroundClass} ${persistentBackClass} ${backButtonClassName}`.trim()}
          aria-label={backLabel}
          title="Back"
          onClick={closeSearch}
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>

        <div
          id={fieldId}
          className={`flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-transparent px-3.5 shadow-none transition-[background-color,border-color,box-shadow] focus-within:border-transparent focus-within:shadow-none ${fieldClass} ${persistentFieldClass}`.trim()}
          data-control-radius-surface
          data-expandable-search-field
        >
          {persistentDesktop && (
            <MagnifyingGlass
              className="hidden min-[821px]:block"
              size={19}
              aria-hidden="true"
            />
          )}
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            autoFocus={open}
            tabIndex={open || persistentDesktop ? 0 : -1}
            className={`native-search-clear-hidden h-6 min-w-0 flex-1 appearance-none rounded-none bg-transparent text-[15px]! leading-6! outline-none focus-visible:outline-none! ${inputClass} ${inputVisibilityClass} ${persistentDesktop ? "min-[821px]:h-auto min-[821px]:text-[0.8rem]! min-[821px]:leading-5!" : ""}`.trim()}
            data-fixed-radius
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onFocus={() => onOpenChange(true)}
            placeholder={placeholder}
            data-search-shortcut-target
            data-search-shortcut-priority={
              shortcutPriority ? "true" : undefined
            }
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
          />
          {persistentDesktop && (
            <span className="hidden min-[821px]:inline-flex">
              <SearchShortcutHint />
            </span>
          )}
          {value ? (
            <button
              type="button"
              className={`flex size-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)] active:bg-[color-mix(in_srgb,currentColor_18%,transparent)] focus-visible:outline-2 focus-visible:outline-(--accent) ${overlay ? "text-white/72 hover:text-white" : "text-(--muted) hover:text-(--text)"} ${persistentDesktop ? "min-[821px]:size-auto min-[821px]:min-h-8 min-[821px]:min-w-8 min-[821px]:rounded-(--control-radius-structured)" : ""}`.trim()}
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                onValueChange("");
                inputRef.current?.focus();
              }}
            >
              <X
                className={
                  persistentDesktop ? "size-5 min-[821px]:size-4" : "size-5"
                }
                aria-hidden="true"
              />
            </button>
          ) : (
            <MagnifyingGlass
              className={persistentDesktop ? "min-[821px]:hidden" : ""}
              size={21}
              aria-hidden="true"
              data-mobile-search-icon
            />
          )}
        </div>
      </div>
    </div>
  );
}
