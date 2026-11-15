import type { LegalPageContent } from "@veolms/contracts";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LegalDocument } from "./legalDocument";

interface MarkdownSection {
  id: string;
  title: string;
  markdown: string;
}

/** An element id from a section's heading: "Postal address" → "postal-address". */
function sectionId(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "section";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * The page's opening paragraphs and its sections: each `## ` line starts a
 * section, as the editor's help explains.
 */
export function splitLegalMarkdown(markdown: string): {
  intro: string;
  sections: MarkdownSection[];
} {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const taken = new Set<string>();
  const introLines: string[] = [];
  const sections: MarkdownSection[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/u.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^##\s+(.+?)\s*#*\s*$/u.exec(line);
    if (heading) {
      const title = heading[1]!;
      sections.push({ id: sectionId(title, taken), title, markdown: "" });
    } else if (sections.length > 0) {
      sections[sections.length - 1]!.markdown += `${line}\n`;
    } else {
      introLines.push(line);
    }
  }
  return { intro: introLines.join("\n").trim(), sections };
}

/** Markdown as the legal pages show it: GitHub tables, no raw HTML. */
export function LegalMarkdown({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>;
}

/**
 * A page from the API in the shape the legal layout draws: sections
 * numbered in order, each with the id "On this page" links to.
 */
export function legalDocumentFromContent(
  path: string,
  content: LegalPageContent,
): LegalDocument {
  const { intro, sections } = splitLegalMarkdown(content.markdown);
  return {
    path,
    title: content.title,
    description: content.description,
    heading: content.heading,
    ...(content.effective ? { effective: content.effective } : {}),
    intro: intro ? <LegalMarkdown>{intro}</LegalMarkdown> : null,
    sections: sections.map(({ id, title }) => ({ id, title })),
    body: (
      <>
        {sections.map((section, index) => (
          <section key={section.id} id={section.id}>
            <h2>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </h2>
            <LegalMarkdown>{section.markdown}</LegalMarkdown>
          </section>
        ))}
      </>
    ),
  };
}
