import type { CodingFile, CodingTestCase } from "@veolms/contracts";

/** One case on the Testcase tab: an example, maybe edited, or the learner's own. */
export interface CaseDraft {
  key: string;
  /** The example it came from; null for one the learner added. */
  source: CodingTestCase | null;
  /** Each argument as JSON text, as the learner edits it. */
  args: string[];
}

export const MAX_CASE_DRAFTS = 8;
const MAX_ARG_CHARS = 8_000;

export function draftsFrom(cases: readonly CodingTestCase[]): CaseDraft[] {
  return cases
    .filter((test) => !test.hidden)
    .slice(0, MAX_CASE_DRAFTS)
    .map((test) => ({
      key: test.id,
      source: test,
      args: test.args.map((arg) => JSON.stringify(arg)),
    }));
}

/** The draft's arguments, or the first that is not valid JSON. */
export function parseArgs(
  draft: CaseDraft,
): { ok: true; args: unknown[] } | { ok: false; index: number } {
  const args: unknown[] = [];
  for (const [index, text] of draft.args.entries()) {
    if (text.length > MAX_ARG_CHARS) return { ok: false, index };
    try {
      args.push(JSON.parse(text));
    } catch {
      return { ok: false, index };
    }
  }
  return { ok: true, args };
}

/** Unchanged from its example: it is checked against the expected value. */
export function isUnchanged(draft: CaseDraft) {
  if (!draft.source) return false;
  const parsed = parseArgs(draft);
  return (
    parsed.ok &&
    JSON.stringify(parsed.args) === JSON.stringify(draft.source.args)
  );
}

/**
 * The function's parameter names from the starter ("nums", "target"), so
 * inputs read as LeetCode's do. Empty when they cannot be read.
 */
export function parameterNames(
  files: readonly CodingFile[],
  entryFile: string,
  name: string | undefined,
): string[] {
  if (!name) return [];
  const source = files.find((file) => file.path === entryFile)?.content ?? "";
  const escaped = name.replace(/[$]/g, "\\$");
  const match =
    new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)`).exec(source) ??
    new RegExp(
      `(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(?([^)=]*)\\)?\\s*=>`,
    ).exec(source);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((part) =>
      part
        .replace(/\/\*.*?\*\//g, "")
        .replace(/[:=].*$/, "")
        .replace(/[{}[\]?.]/g, "")
        .trim(),
    )
    .filter(Boolean);
}
