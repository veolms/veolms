import type { EmojiData } from "emoji-picker-react/data";

export interface EmojiShortcodeSpan {
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

export interface EmojiSuggestion {
  readonly unified: string;
  readonly emoji: string;
  readonly name: string;
}

interface EmojiRecord extends EmojiSuggestion {
  readonly aliases: readonly string[];
}

interface EmojiIndex {
  readonly records: readonly EmojiRecord[];
  readonly byAlias: ReadonlyMap<string, readonly number[]>;
  readonly byChar: ReadonlyMap<string, readonly number[]>;
  readonly popularity: ReadonlyMap<string, number>;
}

interface ScoredEmoji {
  readonly index: number;
  readonly record: EmojiRecord;
  readonly score: number;
}

const EMOJI_QUERY_MAX_CHARS = 40;
const EMOJI_QUERY_CHARS = /^[\p{L}\p{M}\p{N}_+\-]*$/u;
const EMOJI_SUGGESTION_LIMIT = 8;

const POPULAR_UNIFIED = [
  "1f602",
  "2764-fe0f",
  "1f600",
  "1f44d",
  "1f525",
  "1f389",
  "1f60d",
  "1f970",
] as const;

const SKIN_TONES = [
  { code: "1f3fb", label: "light" },
  { code: "1f3fc", label: "medium-light" },
  { code: "1f3fd", label: "medium" },
  { code: "1f3fe", label: "medium-dark" },
  { code: "1f3ff", label: "dark" },
] as const;

const SKIN_TONE_LABELS = new Map<string, string>(
  SKIN_TONES.map((tone) => [tone.code, tone.label]),
);
const POPULARITY = new Map<string, number>(
  POPULAR_UNIFIED.map((unified, rank) => [unified, rank]),
);

let indexPromise: Promise<EmojiIndex> | null = null;

export function findEmojiShortcode(
  value: string,
  caret: number,
): EmojiShortcodeSpan | null {
  if (caret < 0 || caret > value.length) return null;
  const start = value.lastIndexOf(":", caret - 1);
  if (start < 0 || caret <= start) return null;
  if (start > 0 && !/\s/u.test(value[start - 1] ?? "")) return null;

  const query = value.slice(start + 1, caret);
  if (query.length > EMOJI_QUERY_MAX_CHARS) return null;
  if (!EMOJI_QUERY_CHARS.test(query)) return null;
  if (/^-+$/u.test(query)) return null;
  if (/^[PpDd]$/u.test(query)) return null;

  return { start, end: caret, query };
}

export async function getEmojiSuggestions(
  query: string,
  limit = EMOJI_SUGGESTION_LIMIT,
): Promise<readonly EmojiSuggestion[]> {
  const index = await loadEmojiIndex();
  const key = normalizeAlias(query);

  if (!key) {
    return index.records
      .filter((record) => POPULARITY.has(record.unified))
      .sort(
        (a, b) =>
          (POPULARITY.get(a.unified) ?? 0) - (POPULARITY.get(b.unified) ?? 0),
      )
      .slice(0, limit)
      .map(toSuggestion);
  }

  const candidates = new Set<number>(index.byAlias.get(key) ?? []);
  if (candidates.size < limit * 3) {
    for (const candidate of substringCandidates(index, key)) {
      candidates.add(candidate);
    }
  }

  const scored: ScoredEmoji[] = [];
  for (const candidate of candidates) {
    const record = index.records[candidate];
    if (!record) continue;
    const score = scoreRecord(record, key);
    if (score === null) continue;
    scored.push({ index: candidate, record, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (POPULARITY.get(a.record.unified) ?? 1_000_000) -
        (POPULARITY.get(b.record.unified) ?? 1_000_000) ||
      a.index - b.index,
  );
  return scored.slice(0, limit).map(({ record }) => toSuggestion(record));
}

function loadEmojiIndex(): Promise<EmojiIndex> {
  if (!indexPromise) {
    const pending = import("emoji-picker-react/data/emojis-en").then((module) =>
      buildEmojiIndex(module.default),
    );
    const guarded = pending.catch((error: unknown) => {
      if (indexPromise === guarded) indexPromise = null;
      throw error;
    });
    indexPromise = guarded;
  }
  return indexPromise;
}

function buildEmojiIndex(data: EmojiData): EmojiIndex {
  const records: EmojiRecord[] = [];
  const byAlias = new Map<string, number[]>();
  const byChar = new Map<string, number[]>();

  function addRecord(
    unified: string,
    emoji: string,
    name: string,
    aliases: Iterable<string>,
  ) {
    if (!emoji) return;
    const normalized = Array.from(
      new Set(Array.from(aliases, normalizeAlias).filter(Boolean)),
    );
    const record: EmojiRecord = {
      unified: unified.toLowerCase(),
      emoji,
      name,
      aliases: normalized,
    };
    const index = records.push(record) - 1;
    for (const alias of normalized) {
      appendTo(byAlias, alias, index);
      for (const char of alias) appendTo(byChar, char, index);
    }
  }

  for (const group of Object.values(data.emojis ?? {})) {
    for (const emoji of group ?? []) {
      const names = (emoji.n ?? []).filter(
        (name): name is string => typeof name === "string" && name.length > 0,
      );
      const displayName = names[names.length - 1] ?? "emoji";
      const glyph = emojiFromUnified(emoji.u);

      addRecord(emoji.u, glyph, displayName, names);

      for (const [variationIndex, unified] of (emoji.v ?? []).entries()) {
        const modifier = unified
          .split("-")
          .find((part) => SKIN_TONE_LABELS.has(part));
        const label = modifier
          ? (SKIN_TONE_LABELS.get(modifier) ?? "skin tone")
          : `variation ${variationIndex + 1}`;
        const number = modifier
          ? (SKIN_TONES.findIndex((tone) => tone.code === modifier) ?? -1) + 1
          : variationIndex + 1;
        const variationAliases = new Set<string>();
        for (const name of names) {
          variationAliases.add(`${name} ${label}`);
          variationAliases.add(`${name} skin tone ${number}`);
          variationAliases.add(`${name} tone ${number}`);
        }
        addRecord(
          unified,
          emojiFromUnified(unified),
          `${displayName} (${label})`,
          variationAliases,
        );
      }
    }
  }

  return {
    records,
    byAlias,
    byChar,
    popularity: POPULARITY,
  };
}

function substringCandidates(
  index: EmojiIndex,
  key: string,
): readonly number[] {
  const buckets: readonly (readonly number[])[] = Array.from(
    new Set(Array.from(key)),
  )
    .map((char) => index.byChar.get(char))
    .filter((bucket): bucket is readonly number[] => Boolean(bucket?.length));
  const smallest = buckets.reduce<readonly number[] | null>(
    (best, bucket) => (!best || bucket.length < best.length ? bucket : best),
    null,
  );
  if (!smallest) return [];
  return smallest.filter((candidate) =>
    index.records[candidate]?.aliases.some((alias) => alias.includes(key)),
  );
}

function scoreRecord(record: EmojiRecord, key: string): number | null {
  let best = Number.POSITIVE_INFINITY;
  for (const alias of record.aliases) {
    if (alias === key) return 0;
    if (alias.startsWith(key)) {
      best = Math.min(best, 1 + (alias.length - key.length) / 1000);
    } else {
      const at = alias.indexOf(key);
      if (at >= 0) best = Math.min(best, 2 + at / 1000);
    }
  }
  return Number.isFinite(best) ? best : null;
}

function normalizeAlias(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s\-_]+/gu, "");
}

export function emojiFromUnified(unified: string): string {
  const points = unified
    .split("-")
    .map((part) => Number.parseInt(part, 16))
    .filter((point) => Number.isFinite(point));
  if (points.length === 0) return "";
  try {
    return String.fromCodePoint(...points);
  } catch {
    return "";
  }
}

function appendTo(
  map: Map<string, number[]>,
  key: string,
  value: number,
): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function toSuggestion(record: EmojiRecord): EmojiSuggestion {
  return { unified: record.unified, emoji: record.emoji, name: record.name };
}

export { EMOJI_SUGGESTION_LIMIT };
