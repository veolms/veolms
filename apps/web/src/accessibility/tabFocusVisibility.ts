const TAB_NAVIGATION_ATTRIBUTE = "data-tab-navigation";

export function installTabFocusVisibility(root: HTMLElement) {
  const enableForTab = (event: KeyboardEvent) => {
    if (event.key === "Tab")
      root.setAttribute(TAB_NAVIGATION_ATTRIBUTE, "true");
  };
  const disable = () => root.setAttribute(TAB_NAVIGATION_ATTRIBUTE, "false");

  window.addEventListener("keydown", enableForTab, true);
  window.addEventListener("pointerdown", disable, true);
  document.addEventListener("fullscreenchange", disable);

  return () => {
    window.removeEventListener("keydown", enableForTab, true);
    window.removeEventListener("pointerdown", disable, true);
    document.removeEventListener("fullscreenchange", disable);
  };
}
