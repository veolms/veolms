import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DiscussionsWorkspace } from "../../src/workspace/DiscussionsWorkspace.tsx";

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({ ariaLabel }: { ariaLabel: string }) => (
    <button type="button" role="combobox" aria-label={ariaLabel} />
  ),
}));

function publishFromComposer(kind: "question" | "discussion") {
  const onNavigatePage = vi.fn();
  const setNotice = vi.fn();
  render(
    <DiscussionsWorkspace
      role="student"
      onNavigatePage={onNavigatePage}
      setNotice={setNotice}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: kind === "question" ? /Ask a Question/ : /Start a Discussion/,
    }),
  );
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: `${kind} title` },
  });
  fireEvent.change(screen.getByLabelText("Details"), {
    target: { value: `${kind} details` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));

  return { onNavigatePage, setNotice };
}

describe("DiscussionsWorkspace composer", () => {
  it("publishes questions into the Q&A route", () => {
    const { onNavigatePage, setNotice } = publishFromComposer("question");

    expect(onNavigatePage).toHaveBeenCalledWith("/discussions/q-and-a", {
      preserveScroll: true,
    });
    expect(setNotice).toHaveBeenCalledWith("Your question has been published.");
  }, 30_000);

  it("publishes discussions into the comments route", () => {
    const { onNavigatePage, setNotice } = publishFromComposer("discussion");

    expect(onNavigatePage).toHaveBeenCalledWith("/discussions/comments", {
      preserveScroll: true,
    });
    expect(setNotice).toHaveBeenCalledWith(
      "Your discussion has been published.",
    );
  });
});
