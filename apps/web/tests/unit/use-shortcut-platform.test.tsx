import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SHORTCUT_PLATFORM_PREFERENCE_KEY } from "../../src/keyboardShortcuts";
import { useShortcutPlatform } from "../../src/useShortcutPlatform";

function ShortcutPlatformProbe() {
  const platform = useShortcutPlatform();
  return <span>{platform}</span>;
}

beforeEach(() => {
  localStorage.clear();
});

describe("useShortcutPlatform", () => {
  it("keeps prerendered shortcut labels deterministic before hydration", () => {
    localStorage.setItem(SHORTCUT_PLATFORM_PREFERENCE_KEY, "mac");

    expect(renderToString(<ShortcutPlatformProbe />)).toContain("windows");
  });
});
