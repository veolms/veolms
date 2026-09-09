import { afterEach, describe, expect, it, vi } from "vitest";
import { isReactRouterBuildRequest } from "../../src/lib/react-router-build.ts";

describe("isReactRouterBuildRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.IS_RR_BUILD_REQUEST;
  });

  it("does not require the Node process global in the browser", () => {
    vi.stubGlobal("process", undefined);

    expect(isReactRouterBuildRequest()).toBe(false);
  });

  it("detects the React Router prerender flag in Node", () => {
    process.env.IS_RR_BUILD_REQUEST = "yes";

    expect(isReactRouterBuildRequest()).toBe(true);
  });
});
