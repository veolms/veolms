import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type ThemedSelectOption<Value extends string = string> = readonly [
  value: Value,
  label: string,
];

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
}

const joinClasses = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(" ");

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  origin: "top" | "bottom";
}

/**
 * Lightweight, palette-aware select control. Keeping the popup local avoids
 * loading a complete component framework for a control that is usually below
 * the first viewport, while retaining keyboard and screen-reader behavior.
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
}: ThemedSelectProps<Value>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex(([optionValue]) => optionValue === value),
  );
  const selectedLabel = options[selectedIndex]?.[1] ?? value;
  const triggerLabel = ariaLabel
    ? `${ariaLabel}: ${selectedLabel}`
    : selectedLabel;
  const menuId = id ? `${id}-menu` : undefined;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const desiredHeight = Math.min(280, Math.max(42, options.length * 38 + 4));
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const useAbove =
      spaceBelow < Math.min(desiredHeight, 160) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      80,
      Math.min(desiredHeight, useAbove ? spaceAbove - gap : spaceBelow - gap),
    );
    const width = Math.min(
      Math.max(rect.width, 120),
      window.innerWidth - viewportPadding * 2,
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - viewportPadding - width,
    );
    setPosition({
      left,
      top: useAbove ? rect.top - gap : rect.bottom + gap,
      width,
      maxHeight,
      origin: useAbove ? "bottom" : "top",
    });
  }, [options.length]);

  const openMenu = (focusIndex = selectedIndex) => {
    if (disabled) return;
    setOpen(true);
    requestAnimationFrame(() => {
      updatePosition();
      requestAnimationFrame(() => itemRefs.current[focusIndex]?.focus());
    });
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

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
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu(
        event.key === "ArrowUp"
          ? Math.max(0, selectedIndex - 1)
          : selectedIndex,
      );
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = itemRefs.current.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown")
      nextIndex = (currentIndex + 1) % options.length;
    if (event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
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
        <span>{selectedLabel}</span>
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
            className={joinClasses("themed-select__content", contentClassName)}
            onKeyDown={handleMenuKeyDown}
            style={
              {
                position: "fixed",
                left: position.left,
                top: position.top,
                width: position.width,
                boxSizing: "border-box",
                maxHeight: position.maxHeight,
                overflowY: "auto",
                transform:
                  position.origin === "bottom"
                    ? "translateY(-100%)"
                    : undefined,
                transformOrigin: position.origin,
              } as CSSProperties
            }
          >
            <div className={joinClasses("themed-select__viewport", className)}>
              {options.map(([optionValue, optionLabel], index) => (
                <button
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={optionValue === value}
                  data-state={optionValue === value ? "checked" : "unchecked"}
                  className="themed-select__item"
                  key={optionValue}
                  onClick={() => {
                    onValueChange(optionValue);
                    closeMenu(true);
                  }}
                >
                  <span>{optionLabel}</span>
                  {optionValue === value && (
                    <span
                      className="themed-select__indicator"
                      aria-hidden="true"
                    >
                      <Check size={15} weight="bold" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
