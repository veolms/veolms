import { afterEach, describe, expect, it } from "vitest";
import {
  getInitialLearningShellState,
  getLearningShellBootstrapScript,
} from "../../src/learning/learningShellPreferences";

describe("learning shell bootstrap", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.clear();
    delete window.__VEO_BOOTSTRAP__;
    delete document.documentElement.dataset.learningCurriculumState;
    document.documentElement.style.removeProperty(
      "--learning-curriculum-width",
    );
    document.documentElement.style.removeProperty(
      "--learning-curriculum-expanded-width",
    );
    document.querySelector("[data-learning-shell-test]")?.remove();
  });

  it("applies persisted course-content geometry before React initializes", () => {
    window.history.replaceState(
      null,
      "",
      "/learn/backend-nodejs/career-opportunities",
    );
    localStorage.setItem("veolms-curriculum-width", "512");
    localStorage.setItem("veolms-curriculum-collapsed", "true");
    window.__VEO_BOOTSTRAP__ = {
      sidebar: { mode: "collapsed", width: 280 },
    };

    const workspace = document.createElement("div");
    workspace.dataset.learningShellTest = "";
    workspace.innerHTML = `
      <main class="learning-workspace__main"></main>
      <aside class="learning-workspace__curriculum-column"></aside>
    `;
    document.body.append(workspace);

    new Function(getLearningShellBootstrapScript())();

    expect(window.__VEO_BOOTSTRAP__).toEqual({
      sidebar: { mode: "collapsed", width: 280 },
      learning: { curriculumCollapsed: true, curriculumWidth: 512 },
    });
    expect(document.documentElement.dataset.learningCurriculumState).toBe(
      "collapsed",
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--learning-curriculum-width",
      ),
    ).toBe("0px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--learning-curriculum-expanded-width",
      ),
    ).toBe("512px");
    expect(workspace.querySelector("main")).toHaveClass(
      "is-curriculum-collapsed",
    );
    expect(workspace.querySelector("aside")).toHaveClass("is-collapsed");
  });

  it("initializes React from the bootstrap snapshot instead of rereading storage", () => {
    localStorage.setItem("veolms-curriculum-width", "300");
    localStorage.setItem("veolms-curriculum-collapsed", "false");
    window.__VEO_BOOTSTRAP__ = {
      learning: { curriculumCollapsed: true, curriculumWidth: 530 },
    };

    expect(getInitialLearningShellState()).toEqual({
      curriculumCollapsed: true,
      curriculumWidth: 530,
    });
  });
});
