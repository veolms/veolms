import { render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DicebearAvatar } from "../../src/settings/DicebearAvatar.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DicebearAvatar", () => {
  it("fetches the SVG and renders it as an inline <svg> element", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" /></svg>',
          ),
      }),
    );

    const { container } = render(
      <DicebearAvatar url="https://api.dicebear.com/10.x/lorelei/svg" size={96} />,
    );

    await waitFor(() => {
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("width", "96");
      expect(svg).toHaveAttribute("height", "96");
    });
  });

  it("strips <script> tags and inline event handlers before inserting the markup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(0)"><script>alert(1)</script><circle r="5" onload="alert(2)" /></svg>',
          ),
      }),
    );

    const { container } = render(
      <DicebearAvatar url="https://api.dicebear.com/10.x/lorelei/svg" size={64} />,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });

    expect(container.querySelector("svg")?.hasAttribute("onload")).toBe(false);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("circle")?.hasAttribute("onload")).toBe(
      false,
    );
  });

  it("calls onError when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const onError = vi.fn();

    render(
      <DicebearAvatar
        url="https://api.dicebear.com/10.x/lorelei/svg"
        size={64}
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalled());
  });
});
