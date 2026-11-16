/**
 * An academy's initials, its logo until it has one: the first letters of
 * two words, or for one word its capitals (ProCodrr → PC), else its first
 * two letters.
 */
export function initialsOf(name: string): string {
  const words = (name || "Your Academy")
    .replace(/[^A-Za-z0-9 ]/gu, "")
    .split(/\s+/u)
    .filter(Boolean);
  if (words.length === 1) {
    const word = words[0]!;
    const capitals = word.match(/[A-Z]/gu);
    return (
      capitals && capitals.length > 1
        ? capitals.slice(0, 2).join("")
        : word.slice(0, 2)
    ).toUpperCase();
  }
  return (
    words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "YA"
  );
}

/** An address from a name: lowercase letters and numbers, 30 at most. */
export function addressFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "")
    .slice(0, 30);
}

/** A display name for an account made from an email: "ada.lovelace" → "Ada Lovelace". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/[^A-Za-z]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
  return words.join(" ").slice(0, 60) || "Creator";
}

/** A username to try for a new account: letters, numbers and _, 3–30. */
export function usernameFrom(seed: string): string {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9_]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .slice(0, 20) || "creator";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base.length < 3 ? "creator" : base}_${suffix}`;
}

/** "procodrr.veolms.app" as a link. */
export function academyUrl(host: string): string {
  const local = host === "localhost" || host.endsWith(".localhost");
  const port =
    local && typeof window !== "undefined" ? window.location.port : "";
  return `${local ? "http" : "https"}://${host}${port ? `:${port}` : ""}`;
}
