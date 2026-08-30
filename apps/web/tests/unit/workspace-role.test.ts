import { describe, expect, it } from "vitest";
import {
  getAllowedWorkspaceRoles,
  getVisibleWorkspaceRoles,
  resolveWorkspaceRole,
} from "../../src/shell/workspaceRole.ts";

describe("workspace roles", () => {
  it("shows only student or only creator from account roles", () => {
    expect(getAllowedWorkspaceRoles(["student"])).toEqual(["student"]);
    expect(getAllowedWorkspaceRoles(["creator"])).toEqual(["creator"]);
    expect(getAllowedWorkspaceRoles(["instructor"])).toEqual(["creator"]);
  });

  it("lets admins and dual-role accounts preview both workspaces", () => {
    expect(getAllowedWorkspaceRoles(["student", "creator"])).toEqual([
      "student",
      "creator",
    ]);
    expect(getAllowedWorkspaceRoles(["admin"])).toEqual(["student", "creator"]);
  });

  it("does not offer both workspaces when permissions are unknown", () => {
    expect(getVisibleWorkspaceRoles(undefined, "student")).toEqual(["student"]);
    expect(getVisibleWorkspaceRoles([], "creator")).toEqual(["creator"]);
  });

  it("keeps the current workspace inside the allowed set", () => {
    expect(resolveWorkspaceRole(["student"], "creator")).toBe("student");
    expect(resolveWorkspaceRole(["creator"], "student")).toBe("creator");
    expect(resolveWorkspaceRole(["student"], "student")).toBe("student");
  });
});
