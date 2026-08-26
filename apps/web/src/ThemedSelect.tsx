import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import { X } from "@phosphor-icons/react/X";
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
  action?: ThemedSelectAction;
}

const joinClasses = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(" ");

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
  action,
}: ThemedSelectProps<Value>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedIndex = Math.max(
    0,
    options.findIndex(([optionValue]) => optionValue === value),
  );
  const selectedOption = options[selectedIndex];
  const selectedLabel = selectedOption?.[1] ?? value;
  const selectedFlag = selectedOption?.[2]?.flag;
  const triggerLabel = ariaLabel
    ? `${ariaLabel}: ${selectedLabel}`
    : selectedLabel;
  const menuId = id ? `${id}-menu` : undefined;

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const query = searchQuery.trim().toLowerCase();
    return options.filter(([val, label, extra]) => {
      const matchLabel = label.toLowerCase().includes(query);
      const matchVal = val.toLowerCase().includes(query);
      const matchExtraLabel = extra?.label?.toLowerCase().includes(query);
      const matchKeywords = extra?.searchKeywords?.toLowerCase().includes(query);
      return Boolean(
        matchLabel || matchVal || matchExtraLabel || matchKeywords,
      );
    });
  }, [options, searchable, searchQuery]);

  const calculatePosition = useCallback((): MenuPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
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
    const useAbove =
      spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      80,
      Math.min(desiredHeight, useAbove ? spaceAbove - gap : spaceBelow - gap),
    );
    const minWidth = searchable ? 180 : 120;
    const width = Math.min(
      Math.max(rect.width, minWidth),
      window.innerWidth - viewportPadding * 2,
    );
    let left = rect.left;
    if (left + width > window.innerWidth - viewportPadding) {
      left = Math.max(viewportPadding, rect.right - width);
    }
    return {
      left,
      top: useAbove ? undefined : rect.bottom + gap,
      bottom: useAbove ? window.innerHeight - rect.top + gap : undefined,
      width,
      maxHeight,
      side: useAbove ? "top" : "bottom",
    };
  }, [action, filteredOptions.length, searchable]);

  const openMenu = () => {
    if (disabled) return;
    setSearchQuery("");
    const pos = calculatePosition();
    setPosition(pos);
    setOpen(true);
    requestAnimationFrame(() => {
      if (searchable && searchInputRef.current) {
        searchInputRef.current.focus({ preventScroll: true });
      } else {
        itemRefs.current[selectedIndex]?.focus({ preventScroll: true });
      }
    });
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setSearchQuery("");
    setPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useLayoutEffect(() => {
    if (open) {
      const pos = calculatePosition();
      if (pos) setPosition(pos);
    }
  }, [open, calculatePosition]);

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
    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
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
    const currentIndex = itemRefs.current.indexOf(
      document.activeElement as HTMLButtonElement,
    );

    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (isSearchFocused) {
      if (event.key === "ArrowDown" && filteredOptions.length > 0) {
        event.preventDefault();
        itemRefs.current[0]?.focus();
      } else if (event.key === "Enter" && filteredOptions.length === 1) {
        const firstOption = filteredOptions[0];
        if (!firstOption) return;
        event.preventDefault();
        onValueChange(firstOption[0]);
        closeMenu(true);
      }
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % filteredOptions.length;
    }
    if (event.key === "ArrowUp") {
      if (currentIndex === 0 && searchable) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      nextIndex =
        (currentIndex - 1 + filteredOptions.length) % filteredOptions.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = filteredOptions.length - 1;
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
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="themed-select__trigger-value">
          {selectedFlag && (
            <span className="themed-select__trigger-flag" aria-hidden="true">
              {selectedFlag}
            </span>
          )}
          <span>{selectedLabel}</span>
        </span>
        <span className="themed-select__caret" aria-hidden="true">
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
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="themed-select__search-input"
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
                filteredOptions.map(([optionValue, optionLabel, extra], index) => {
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
                })
              )}
            </div>
            {action && (
              <div className="themed-select__action-wrapper">
                <button
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
          document.body,
        )}
    </>
  );
}
