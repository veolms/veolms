import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ANSWER_SAVE_GRACE_MS,
  attemptDeadline,
  isPastDeadline,
} from "./attempt.closing.ts";

const at = (iso: string) => new Date(iso);

void describe("quiz attempt deadline", () => {
  void it("is open-ended without a time limit or due date", () => {
    const deadline = attemptDeadline(
      { expires_at: null },
      { available_until: null },
    );
    assert.equal(deadline, null);
    assert.equal(isPastDeadline(deadline, at("2030-01-01T00:00:00Z")), false);
  });

  void it("uses the time limit when there is no due date", () => {
    assert.deepEqual(
      attemptDeadline(
        { expires_at: at("2026-01-01T10:30:00Z") },
        { available_until: null },
      ),
      at("2026-01-01T10:30:00Z"),
    );
  });

  void it("gives an untimed attempt the due date", () => {
    assert.deepEqual(
      attemptDeadline(
        { expires_at: null },
        { available_until: at("2026-01-01T12:00:00Z") },
      ),
      at("2026-01-01T12:00:00Z"),
    );
  });

  void it("ends at whichever comes first", () => {
    const early = at("2026-01-01T10:10:00Z");
    const late = at("2026-01-01T10:30:00Z");
    assert.deepEqual(
      attemptDeadline({ expires_at: late }, { available_until: early }),
      early,
    );
    assert.deepEqual(
      attemptDeadline({ expires_at: early }, { available_until: late }),
      early,
    );
  });

  void it("is past at the deadline itself, and honours the save margin", () => {
    const deadline = at("2026-01-01T10:30:00.000Z");
    assert.equal(
      isPastDeadline(deadline, at("2026-01-01T10:29:59.999Z")),
      false,
    );
    assert.equal(isPastDeadline(deadline, deadline), true);

    const justAfter = at("2026-01-01T10:30:03.000Z");
    assert.equal(isPastDeadline(deadline, justAfter), true);
    assert.equal(
      isPastDeadline(deadline, justAfter, ANSWER_SAVE_GRACE_MS),
      false,
    );
    assert.equal(
      isPastDeadline(
        deadline,
        at("2026-01-01T10:30:10.000Z"),
        ANSWER_SAVE_GRACE_MS,
      ),
      true,
    );
  });
});
