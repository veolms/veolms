import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "./hooks/useDebounce";
import { useBackDismiss } from "./navigation/useBackDismiss";
import { fuzzyMatches } from "./lib/fuzzySearch";

const THEMED_SELECT_MENU_MAX_WIDTH = 300;
/**
 * A pop-up the select is in: an open modal dialog, or one opened as a
 * popover with this mark (the login card, see auth/authCardDialogOpening).
 */
const OPEN_DIALOG_SELECTOR = "dialog[open], dialog[data-dialog-open]";

export interface ThemedSelectOptionExtra {
  readonly flag?: ReactNode;
  readonly label?: string;
  readonly subtitle?: string;
  readonly searchKeywords?: string;
}

export type ThemedSelectOption<Value extends string = string> = readonly [
  value: Value,
  label: string,
  extra?: ThemedSelectOptionExtra,
];

export interface ThemedSelectAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export interface ThemedSelectProps<Value extends string = string> {
  id?: string;
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly ThemedSelectOption<Value>[];
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchDebounceMs?: number;
  menuMinWidth?: number;
  menuMaxWidth?: number;
  defaultLimit?: number;
  action?: ThemedSelectAction;
  compactOnMobile?: boolean;
  /** Match the menu to the visible control wrapper around the trigger. */
  matchMenuToContainer?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

const joinClasses = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(" ");

/**
 * What the menu lines up with. A trigger drawn bare inside a frame that
 * carries the control's surface (a filter bar's selects) is not the
 * control's edge; the frame is. A parent counts as that frame when the
 * trigger is the only thing in it and it paints a fill or a shadow.
 */
function findControlFrame(trigger: HTMLElement): HTMLElement {
  const parent = trigger.parentElement;
  if (!parent || parent.childElementCount !== 1) return trigger;
  const style = window.getComputedStyle(parent);
  const paintsFill =
    style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    style.backgroundColor !== "transparent";
  return paintsFill || style.boxShadow !== "none" ? parent : trigger;
}

interface MenuPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
  side: "top" | "bottom";
}

/**
 * Lightweight, palette-aware select control with optional live search.
 * Keeping the popup local avoids loading a complete component framework
 * while retaining keyboard, screen-reader, and theme compatibility.
 */
export function ThemedSelect<Value extends string>({
  id,
  value,
  onValueChange,
  options,
  disabled = false,
  ariaLabel,
  className = "",
  triggerClassName = "",
  contentClassName = "",
  searchable = false,
  searchPlaceholder = "Search...",
  searchDebounceMs = DEFAULT_DEBOUNCE_DELAY_MS,
  menuMinWidth,
  menuMaxWidth = THEMED_SELECT_MENU_MAX_WIDTH,
  defaultLimit,
  action,
  compactOnMobile = false,
  matchMenuToContainer = false,
  onOpen,
  onClose,
}: ThemedSelectProps<Value>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);
  // A select inside an open modal dialog (the phone pop-up, say) puts its
  // list in that dialog: everything outside a modal dialog is inert and is
  // drawn under it, so a list portalled into <body> showed behind the
  // pop-up and could not be clicked. There the list is also a manual
  // popover, so it is drawn in the top layer above the dialog's own
  // contents and not clipped by its scrolling; the top layer places it by
  // the viewport, as the fixed position below expects.
  const [dialogHost, setDialogHost] = useState<HTMLDialogElement | null>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, searchDebounceMs);
  // Emptying or reopening the menu must reveal the complete option set
  // immediately; only active typing should wait for the debounce window.
  const effectiveSearchQuery = searchQuery.trim() ? debouncedSearchQuery : "";

  const foundIndex = options.findIndex(
    ([optionValue]) => optionValue === value,
  );
  const selectedIndex = foundIndex >= 0 ? foundIndex : -1;
  const selectedOption =
    selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const selectedLabel =
    selectedOption?.[1] ?? (value || searchPlaceholder || "Select...");
  const selectedFlag = selectedOption?.[2]?.flag;
  const triggerLabel = ariaLabel
    ? `${ariaLabel}: ${selectedLabel}`
    : selectedLabel;
  const menuId = id ? `${id}-menu` : undefined;

  const filteredOptions = useMemo(() => {
    if (!searchable || !effectiveSearchQuery.trim()) {
      if (defaultLimit && defaultLimit > 0 && options.length > defaultLimit) {
        const firstOption = options[0];
        const hasHeaderOption = Boolean(firstOption && firstOption[0] === "");
        const headerOption: ThemedSelectOption<Value>[] =
          hasHeaderOption && firstOption ? [firstOption] : [];
        const contentOptions = hasHeaderOption ? options.slice(1) : options;
        const limited = contentOptions.slice(0, defaultLimit);

        if (value && !limited.some(([val]) => val === value)) {
          const currentOpt = options.find(([val]) => val === value);
          if (currentOpt && (!hasHeaderOption || currentOpt[0] !== "")) {
            limited.push(currentOpt);
          }
        }
        return [...headerOption, ...limited];
      }
      return options;
    }
    const query = effectiveSearchQuery.trim().toLowerCase();
    return options.filter(
      ([val, label, extra]) =>
        // A value (an id, a code) is matched as typed; the words shown,
        // loosely.
        val.toLowerCase().includes(query) ||
        fuzzyMatches(
          query,
          label,
          extra?.label,
          extra?.subtitle,
          extra?.searchKeywords,
        ),
    );
  }, [options, searchable, effectiveSearchQuery, defaultLimit, value]);

  const measureNaturalMenuWidth = useCallback(
    (trigger: HTMLButtonElement) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return 0;

      const triggerStyle = window.getComputedStyle(trigger);
      context.font = triggerStyle.font;

      const longestOptionWidth = options.reduce((longest, [, label, extra]) => {
        const visibleLabel = extra?.label ?? label;
        return Math.max(longest, context.measureText(visibleLabel).width);
      }, 0);
      const searchWidth = searchable
        ? context.measureText(searchPlaceholder).width + 88
        : 0;
      const actionWidth = action
        ? context.measureText(action.label).width + 54
        : 0;

      // Include item padding, the selected indicator, and an optional flag so
      // labels have room to render before the viewport clamp is applied.
      return Math.ceil(
        Math.max(longestOptionWidth + 54, searchWidth, actionWidth),
      );
    },
    [action, options, searchPlaceholder, searchable],
  );

  const calculatePosition = useCallback((): MenuPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const anchor = matchMenuToContainer
      ? trigger.parentElement
      : findControlFrame(trigger);
    const rect = (anchor ?? trigger).getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const desiredHeight = Math.min(
      340,
      Math.max(
        48,
        (searchable ? 44 : 0) +
          filteredOptions.length * 38 +
          (action ? 42 : 0) +
          12,
      ),
    );
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const useAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      80,
      Math.min(desiredHeight, useAbove ? spaceAbove - gap : spaceBelow - gap),
    );
    const desiredWidth = Math.max(
      rect.width,
      searchable ? 180 : 120,
      menuMinWidth ?? 0,
      measureNaturalMenuWidth(trigger),
    );
    const width = Math.min(
      desiredWidth,
      menuMaxWidth,
      window.innerWidth - viewportPadding * 2,
    );
    // The menu ends where the control ends: a list wider than its control
    // grows towards the start, and one near the start edge of the window
    // is kept on screen.
    // In a pop-up the list starts where the control starts instead, so it
    // stays over the pop-up rather than hanging off its side.
    const inDialog = Boolean(trigger.closest(OPEN_DIALOG_SELECTOR));
    const left = inDialog
      ? Math.max(
          viewportPadding,
          Math.min(rect.left, window.innerWidth - viewportPadding - width),
        )
      : Math.max(viewportPadding, rect.right - width);
    return {
      left,
      top: useAbove ? undefined : rect.bottom + gap,
      bottom: useAbove ? window.innerHeight - rect.top + gap : undefined,
      width,
      maxHeight,
      side: useAbove ? "top" : "bottom",
    };
  }, [
    action,
    filteredOptions.length,
    measureNaturalMenuWidth,
    matchMenuToContainer,
    menuMaxWidth,
    menuMinWidth,
    searchable,
  ]);

  const openMenu = () => {
    if (disabled) return;
    if (!open) onOpen?.();
    setSearchQuery("");
    const pos = calculatePosition();
    setPosition(pos);
    setDialogHost(
      triggerRef.current?.closest<HTMLDialogElement>(OPEN_DIALOG_SELECTOR) ??
        null,
    );
    setOpen(true);
    requestAnimationFrame(() => {
      if (searchable && searchInputRef.current) {
        searchInputRef.current.focus({ preventScroll: true });
      } else {
        const selectedItem = itemRefs.current.find(
          (item) => item?.dataset.value === value,
        );
        (selectedItem ?? itemRefs.current[0])?.focus({
          preventScroll: true,
        });
      }
    });
  };

  const closeMenu = (restoreFocus = false) => {
    if (open) onClose?.();
    setOpen(false);
    setSearchQuery("");
    setPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useBackDismiss({
    open,
    onDismiss: () => closeMenu(true),
  });

  useLayoutEffect(() => {
    if (open) {
      const pos = calculatePosition();
      if (pos) setPosition(pos);
    }
  }, [open, calculatePosition]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!open || !dialogHost || !content?.isConnected) return;
    if (!content.matches(":popover-open")) content.showPopover();
  }, [dialogHost, open, position]);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        contentRef.current?.contains(target)
      )
        return;
      closeMenu();
    };
    const reposition = () => {
      const pos = calculatePosition();
      if (pos) setPosition(pos);
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && contentRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, calculatePosition]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isSearchFocused = document.activeElement === searchInputRef.current;
    const isActionFocused = document.activeElement === actionButtonRef.current;
    const currentIndex = itemRefs.current.indexOf(
      document.activeElement as HTMLButtonElement,
    );

    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      if (event.key === "Escape") event.stopPropagation();
      closeMenu(true);
      return;
    }

    if (isSearchFocused) {
      if (event.key === "ArrowDown") {
        if (filteredOptions.length > 0) {
          event.preventDefault();
          itemRefs.current[0]?.focus();
        } else if (action && actionButtonRef.current) {
          event.preventDefault();
          actionButtonRef.current.focus();
        }
      } else if (event.key === "ArrowUp") {
        if (action && actionButtonRef.current) {
          event.preventDefault();
          actionButtonRef.current.focus();
        } else if (filteredOptions.length > 0) {
          event.preventDefault();
          itemRefs.current[filteredOptions.length - 1]?.focus();
        }
      } else if (event.key === "Enter" && filteredOptions.length === 1) {
        const firstOption = filteredOptions[0];
        if (!firstOption) return;
        event.preventDefault();
        onValueChange(firstOption[0]);
        closeMenu(true);
      }
      return;
    }

    if (isActionFocused) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (searchable && searchInputRef.current) {
          searchInputRef.current.focus();
        } else if (filteredOptions.length > 0) {
          itemRefs.current[0]?.focus();
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (filteredOptions.length > 0) {
          itemRefs.current[filteredOptions.length - 1]?.focus();
        } else if (searchable && searchInputRef.current) {
          searchInputRef.current.focus();
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        if (searchable && searchInputRef.current) {
          searchInputRef.current.focus();
        } else if (filteredOptions.length > 0) {
          itemRefs.current[0]?.focus();
        }
      } else if (event.key === "End") {
        event.preventDefault();
        actionButtonRef.current?.focus();
      }
      return;
    }

    if (currentIndex === -1) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (searchable && searchInputRef.current) {
          searchInputRef.current.focus();
        } else if (filteredOptions.length > 0) {
          itemRefs.current[0]?.focus();
        } else if (action && actionButtonRef.current) {
          actionButtonRef.current.focus();
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (action && actionButtonRef.current) {
          actionButtonRef.current.focus();
        } else if (filteredOptions.length > 0) {
          itemRefs.current[filteredOptions.length - 1]?.focus();
        } else if (searchable && searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      if (currentIndex === filteredOptions.length - 1) {
        if (action && actionButtonRef.current) {
          event.preventDefault();
          actionButtonRef.current.focus();
          return;
        }
        if (searchable && searchInputRef.current) {
          event.preventDefault();
          searchInputRef.current.focus();
          return;
        }
        nextIndex = 0;
      } else {
        nextIndex = (currentIndex + 1) % filteredOptions.length;
      }
    }
    if (event.key === "ArrowUp") {
      if (currentIndex === 0) {
        if (searchable && searchInputRef.current) {
          event.preventDefault();
          searchInputRef.current.focus();
          return;
        }
        if (action && actionButtonRef.current) {
          event.preventDefault();
          actionButtonRef.current.focus();
          return;
        }
        nextIndex = filteredOptions.length - 1;
      } else {
        nextIndex =
          (currentIndex - 1 + filteredOptions.length) % filteredOptions.length;
      }
    }
    if (event.key === "Home") {
      if (searchable && searchInputRef.current) {
        event.preventDefault();
        searchInputRef.current.focus();
        return;
      }
      nextIndex = 0;
    }
    if (event.key === "End") {
      if (action && actionButtonRef.current) {
        event.preventDefault();
        actionButtonRef.current.focus();
        return;
      }
      nextIndex = filteredOptions.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    itemRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={joinClasses("themed-select__trigger", triggerClassName)}
        aria-label={triggerLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        data-state={open ? "open" : "closed"}
        data-compact-mobile={compactOnMobile || undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={joinClasses(
            "themed-select__trigger-value",
            compactOnMobile && "max-sm:justify-center",
          )}
        >
          {selectedFlag && (
            <span className="themed-select__trigger-flag" aria-hidden="true">
              {selectedFlag}
            </span>
          )}
          <span className={compactOnMobile ? "max-sm:sr-only" : undefined}>
            {selectedLabel}
          </span>
        </span>
        <span
          className={joinClasses(
            "themed-select__caret",
            compactOnMobile && "max-sm:hidden",
          )}
          aria-hidden="true"
        >
          <CaretDown size={16} weight="bold" />
        </span>
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            data-side={position.side}
            popover={dialogHost ? "manual" : undefined}
            className={joinClasses("themed-select__content", contentClassName)}
            onKeyDown={handleMenuKeyDown}
            style={
              {
                position: "fixed",
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: position.width,
                boxSizing: "border-box",
                maxHeight: position.maxHeight,
                overflowY: "auto",
                // A popover's own defaults (centred, a margin, padding and
                // all four edges at 0) would undo the placement.
                ...(dialogHost
                  ? {
                      margin: 0,
                      padding: 0,
                      right: "auto",
                      bottom: position.bottom ?? "auto",
                      top: position.top ?? "auto",
                    }
                  : null),
              } as CSSProperties
            }
          >
            {searchable && (
              <div className="themed-select__search-wrapper">
                <MagnifyingGlass
                  size={15}
                  className="themed-select__search-icon"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="themed-select__search-input native-search-clear-hidden"
                  aria-label={searchPlaceholder}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="themed-select__search-clear"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                  >
                    <X size={13} weight="bold" />
                  </button>
                )}
              </div>
            )}
            <div className={joinClasses("themed-select__viewport", className)}>
              {filteredOptions.length === 0 ? (
                <div className="themed-select__empty">No results found</div>
              ) : (
                filteredOptions.map(
                  ([optionValue, optionLabel, extra], index) => {
                    const isChecked = optionValue === value;
                    const itemLabel = extra?.label ?? optionLabel;
                    return (
                      <button
                        ref={(node) => {
                          itemRefs.current[index] = node;
                        }}
                        type="button"
                        role="option"
                        aria-selected={isChecked}
                        data-value={optionValue}
                        data-state={isChecked ? "checked" : "unchecked"}
                        className="themed-select__item"
                        key={optionValue}
                        onClick={() => {
                          onValueChange(optionValue);
                          closeMenu(true);
                        }}
                      >
                        <span className="themed-select__item-content">
                          {extra?.flag && (
                            <span
                              className="themed-select__item-flag"
                              aria-hidden="true"
                            >
                              {extra.flag}
                            </span>
                          )}
                          <span className="themed-select__item-label">
                            {itemLabel}
                          </span>
                        </span>
                        {isChecked && (
                          <span
                            className="themed-select__indicator"
                            aria-hidden="true"
                          >
                            <Check size={15} weight="bold" />
                          </span>
                        )}
                      </button>
                    );
                  },
                )
              )}
            </div>
            {action && (
              <div className="themed-select__action-wrapper">
                <button
                  ref={actionButtonRef}
                  type="button"
                  className="themed-select__action-btn"
                  onClick={() => {
                    closeMenu(true);
                    action.onSelect();
                  }}
                >
                  {action.icon ?? <Plus size={14} weight="bold" />}
                  <span>{action.label}</span>
                </button>
              </div>
            )}
          </div>,
          dialogHost ?? document.body,
        )}
    </>
  );
}
