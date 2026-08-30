import { useEffect } from "react";
import type { ShortcutPlatform } from "./keyboardShortcuts";
import { useShortcutPlatform } from "./useShortcutPlatform";

export const SEARCH_SHORTCUT_SELECTOR = "[data-search-shortcut-target]";
export const SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS = "Control+K Meta+K";

const isVisibleElement = (element: HTMLElement) => {
  const styles = window.getComputedStyle(element);
  return (
    styles.display !== "none" &&
    styles.visibility !== "hidden" &&
    element.getClientRects().length > 0
  );
};

const isVisibleSearchInput = (input: HTMLInputElement) =>
  !input.disabled && isVisibleElement(input);

const getVisibleSearchController = (input: HTMLInputElement) => {
  if (!input.id) return null;
  return (
    [
      ...document.querySelectorAll<HTMLButtonElement>("button[aria-controls]"),
    ].find(
      (button) =>
        button.getAttribute("aria-controls") === input.id &&
        isVisibleElement(button),
    ) ?? null
  );
};

export function getSearchShortcutLabel(platform: ShortcutPlatform) {
  return platform === "mac" ? "⌘ K" : "Ctrl K";
}

export function SearchShortcutHint({ className = "" }: { className?: string }) {
  const platform = useShortcutPlatform();

  return (
    <kbd
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_72%,transparent)] px-1.5 py-0.5 text-[0.64rem] font-semibold leading-4 tracking-[0.02em] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_7%,transparent)] ${className}`.trim()}
    >
      {getSearchShortcutLabel(platform)}
    </kbd>
  );
}

export function useGlobalSearchShortcut(platform: ShortcutPlatform) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifierPressed =
        platform === "mac"
          ? event.metaKey && !event.ctrlKey
          : event.ctrlKey && !event.metaKey;
      if (
        !modifierPressed ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      ) {
        return;
      }

      const activeElement = document.activeElement;
      const searchInputs = [
        ...document.querySelectorAll<HTMLInputElement>(
          SEARCH_SHORTCUT_SELECTOR,
        ),
      ];
      const activeSearchInput =
        activeElement instanceof HTMLInputElement &&
        activeElement.matches(SEARCH_SHORTCUT_SELECTOR)
          ? activeElement
          : null;
      const prioritySearchInput = searchInputs.find(
        (candidate) =>
          candidate.dataset.searchShortcutPriority === "true" &&
          (isVisibleSearchInput(candidate) ||
            Boolean(getVisibleSearchController(candidate))),
      );
      const preferredVisibleInput = [
        activeSearchInput,
        prioritySearchInput,
      ].find(
        (candidate, index, all) =>
          candidate &&
          all.indexOf(candidate) === index &&
          isVisibleSearchInput(candidate),
      );
      const prioritySearchNeedsOpen =
        prioritySearchInput && !isVisibleSearchInput(prioritySearchInput)
          ? prioritySearchInput
          : null;
      const input =
        preferredVisibleInput ??
        (prioritySearchNeedsOpen
          ? undefined
          : searchInputs.find(isVisibleSearchInput));

      const hiddenSearchInput = [prioritySearchNeedsOpen, ...searchInputs].find(
        (candidate, index, all) =>
          candidate &&
          all.indexOf(candidate) === index &&
          !isVisibleSearchInput(candidate) &&
          Boolean(getVisibleSearchController(candidate)),
      );
      const focusInput = input ?? hiddenSearchInput;

      if (!focusInput) return;

      event.preventDefault();
      event.stopPropagation();
      if (!input && hiddenSearchInput?.id) {
        getVisibleSearchController(hiddenSearchInput)?.click();
      }
      window.requestAnimationFrame(() => {
        focusInput.focus();
        focusInput.setSelectionRange(
          focusInput.value.length,
          focusInput.value.length,
        );
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [platform]);
}
