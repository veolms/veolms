import assert from "node:assert/strict";
import { test } from "node:test";
import {
  setTeamMemberTitleRequestSchema,
  TEAM_TITLE_MAX_LENGTH,
} from "@veolms/contracts";
import { normalizeTeamTitle } from "./members.service.ts";

await test("a team title is trimmed, folded to one line, and empty clears it", () => {
  assert.equal(normalizeTeamTitle("  Lead   Engineer "), "Lead Engineer");
  assert.equal(normalizeTeamTitle("Mentor"), "Mentor");
  assert.equal(normalizeTeamTitle(""), null);
  assert.equal(normalizeTeamTitle("    "), null);
});

await test("the title request accepts up to 40 plain characters", () => {
  const ok = setTeamMemberTitleRequestSchema.safeParse({
    title: "  Teaching Assistant  ",
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data?.title, "Teaching Assistant");

  const empty = setTeamMemberTitleRequestSchema.safeParse({ title: "" });
  assert.equal(empty.success, true);

  const longest = "a".repeat(TEAM_TITLE_MAX_LENGTH);
  assert.equal(
    setTeamMemberTitleRequestSchema.safeParse({ title: longest }).success,
    true,
  );
  assert.equal(
    setTeamMemberTitleRequestSchema.safeParse({ title: `${longest}b` }).success,
    false,
  );
  // Spaces around a 40-character title are trimmed before the length check.
  assert.equal(
    setTeamMemberTitleRequestSchema.safeParse({ title: ` ${longest} ` })
      .success,
    true,
  );
});

await test("the title request refuses markup, line breaks and extra fields", () => {
  for (const title of ["<b>Lead</b>", "Lead\nEngineer", "Tab\there"]) {
    assert.equal(
      setTeamMemberTitleRequestSchema.safeParse({ title }).success,
      false,
      title,
    );
  }
  assert.equal(
    setTeamMemberTitleRequestSchema.safeParse({ title: "Mentor", role: "x" })
      .success,
    false,
  );
});
