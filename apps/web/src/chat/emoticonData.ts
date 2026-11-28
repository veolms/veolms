import { emojiFromUnified, type EmojiSuggestion } from "./emojiShortcodeData";

export interface EmoticonSpan {
  readonly start: number;
  readonly end: number;
  readonly emoticon: string;
}

interface EmoticonEntry {
  readonly emoticon: string;
  readonly unified: string;
  readonly name: string;
}

const EMOTICON_ENTRIES: readonly EmoticonEntry[] = [
  { emoticon: ":'(", unified: "1f622", name: "crying face" },
  { emoticon: `:'-(`, unified: "1f622", name: "crying face" },
  { emoticon: ":-)", unified: "1f642", name: "slightly smiling face" },
  { emoticon: ":-(", unified: "1f641", name: "slightly frowning face" },
  { emoticon: ":-D", unified: "1f603", name: "smiling face with open mouth" },
  { emoticon: ":-d", unified: "1f603", name: "smiling face with open mouth" },
  { emoticon: ":-P", unified: "1f61b", name: "face with tongue" },
  { emoticon: ":-p", unified: "1f61b", name: "face with tongue" },
  { emoticon: ":-O", unified: "1f62e", name: "face with open mouth" },
  { emoticon: ":-o", unified: "1f62e", name: "face with open mouth" },
  { emoticon: ":-/", unified: "1f615", name: "confused face" },
  { emoticon: ":-|", unified: "1f610", name: "neutral face" },
  { emoticon: ";-)", unified: "1f609", name: "winking face" },
  { emoticon: ":)", unified: "1f642", name: "slightly smiling face" },
  { emoticon: ":(", unified: "1f641", name: "slightly frowning face" },
  { emoticon: ":D", unified: "1f603", name: "smiling face with open mouth" },
  { emoticon: ":d", unified: "1f603", name: "smiling face with open mouth" },
  { emoticon: ":P", unified: "1f61b", name: "face with tongue" },
  { emoticon: ":p", unified: "1f61b", name: "face with tongue" },
  { emoticon: ":O", unified: "1f62e", name: "face with open mouth" },
  { emoticon: ":o", unified: "1f62e", name: "face with open mouth" },
  { emoticon: ":|", unified: "1f610", name: "neutral face" },
  { emoticon: ":/", unified: "1f615", name: "confused face" },
  { emoticon: ";)", unified: "1f609", name: "winking face" },
  { emoticon: "<3", unified: "2764-fe0f", name: "red heart" },
  { emoticon: "XD", unified: "1f923", name: "rolling on the floor laughing" },
  { emoticon: "xd", unified: "1f923", name: "rolling on the floor laughing" },
  { emoticon: "Xd", unified: "1f923", name: "rolling on the floor laughing" },
  { emoticon: "xD", unified: "1f923", name: "rolling on the floor laughing" },
].sort((a, b) => b.emoticon.length - a.emoticon.length);

const EMOTICON_BY_KEY = new Map<string, EmoticonEntry>(
  EMOTICON_ENTRIES.map((entry) => [entry.emoticon.toLowerCase(), entry]),
);

export function findEmoticon(
  value: string,
  caret: number,
): EmoticonSpan | null {
  if (caret < 0 || caret > value.length) return null;
  for (const entry of EMOTICON_ENTRIES) {
    const start = caret - entry.emoticon.length;
    if (start < 0) continue;
    if (value.slice(start, caret) !== entry.emoticon) continue;
    if (!hasBoundary(value, start) || isInsideUrl(value, start)) continue;
    return { start, end: caret, emoticon: entry.emoticon };
  }
  return null;
}

export function getEmoticonSuggestions(
  emoticon: string,
): readonly EmojiSuggestion[] {
  const entry = EMOTICON_BY_KEY.get(emoticon.toLowerCase());
  if (!entry) return [];
  return [
    {
      unified: entry.unified,
      emoji: emojiFromUnified(entry.unified),
      name: entry.name,
    },
  ];
}

function hasBoundary(value: string, start: number): boolean {
  if (start === 0) return true;
  const previous = value[start - 1] ?? "";
  return /\s/u.test(previous) || /[([{"'“‘]/u.test(previous);
}

function isInsideUrl(value: string, start: number): boolean {
  let index = start - 1;
  while (index >= 0 && !/\s/u.test(value[index] ?? "")) index -= 1;
  const token = value.slice(index + 1, start);
  return (
    token.includes("://") ||
    token.startsWith("www.") ||
    /\.[a-z]{2,}(?:[/:?#]|$)/iu.test(token)
  );
}
