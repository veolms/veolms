/**
 * Gives a course description written as plain lines the shape its writer
 * meant. Descriptions brought over from other platforms are one line per
 * thought, with no blank lines and no Markdown: an introduction, a short
 * question such as "What you'll get?", then a line per point, each led by
 * an emoji and a label ("➡️ Real-World Projects: Apply your…"). Shown as
 * written, they run together as one block.
 *
 * Such a description is turned into Markdown:
 * - every line becomes a paragraph of its own, so the lines are spaced;
 * - a short line ending in "?" or ":" that comes before a line led by an
 *   emoji is made bold, as the heading of the points under it;
 * - on a line led by an emoji, a short label before a colon is made bold.
 *
 * A description that already has blank lines or Markdown of its own is
 * left as it is: its writer has shaped it.
 */
export function formatPlainDescription(text: string): string {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (lines.length < 2 || !isPlain(lines)) return text.trim();

  return lines
    .map((line, index) => {
      const next = lines[index + 1];
      if (
        !startsWithEmoji(line) &&
        next !== undefined &&
        startsWithEmoji(next) &&
        line.length <= 60 &&
        /[?:]$/.test(line)
      ) {
        return `**${line}**`;
      }
      return boldLeadingLabel(line);
    })
    .join("\n\n");
}

/** No blank line, and nothing that reads as Markdown. */
function isPlain(lines: string[]): boolean {
  return lines.every(
    (line) =>
      line.length > 0 &&
      !/^(#{1,6}\s|[-*+]\s|>\s?|\d+[.)]\s|```)/.test(line) &&
      !/\*\*|__/.test(line),
  );
}

const EMOJI_PREFIX =
  /^((?:\p{Extended_Pictographic}|\p{Emoji_Presentation})[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}]*\s*)/u;

function startsWithEmoji(line: string): boolean {
  return EMOJI_PREFIX.test(line);
}

/** "➡️ Real-World Projects: Apply…" → "➡️ **Real-World Projects:** Apply…" */
function boldLeadingLabel(line: string): string {
  const prefix = line.match(EMOJI_PREFIX)?.[1];
  if (!prefix) return line;
  const rest = line.slice(prefix.length);
  const [, name, body] = rest.match(/^([^:.!?]{2,40}):\s+(\S.*)$/) ?? [];
  if (!name || !body || /https?$/i.test(name)) return line;
  return `${prefix}**${name.trim()}:** ${body}`;
}
