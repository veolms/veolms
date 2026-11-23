import {
  matchesFuzzyText,
  type StorageFileKind,
  type StorageFileSource,
} from "@veolms/contracts";

/** Words a file is also found by: what it is, and where it was sent. */
const KIND_WORDS: Record<StorageFileKind, string> = {
  image: "photo image picture",
  video: "video",
  audio: "voice audio",
  file: "document file",
};
const SOURCE_WORDS: Record<StorageFileSource, string> = {
  chat: "chat",
  discussion: "discussion note",
  support: "support",
};

/**
 * Whether a search typed in Media storage finds a file: every word, in any
 * order, in its name, the place it was sent (the chat, the lesson's
 * discussion, the ticket) or its kind, a typo allowed (the app's search
 * rule, `matchesFuzzyText`). One person's files only, so matching them all
 * here stays quick (a few thousand in well under 50 ms).
 */
export function fileMatchesSearch(
  search: string,
  file: {
    name: string;
    place: string | null;
    kind: StorageFileKind;
    source: StorageFileSource;
  },
): boolean {
  return matchesFuzzyText(
    search,
    file.name,
    file.place,
    KIND_WORDS[file.kind],
    SOURCE_WORDS[file.source],
  );
}
