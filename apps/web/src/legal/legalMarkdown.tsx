import type { LegalPage } from "@veolms/contracts";
import { Fragment } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import type { LegalDocument } from "./legalDocument";

/**
 * A legal page written in Markdown (Platform → Legal pages). Each line
 * `## Heading {#anchor}` starts a numbered section; the anchor is the id the
 * "On this page" lists link to, and any further `#anchor`s in the braces are
 * old anchors that still land on the section. Without braces the anchor is
 * made from the heading. Text before the first section is the introduction.
 */
export interface LegalMarkdownSection {
  id: string;
  /** Older anchors kept working for this section. */
  aliases: string[];
  title: string;
  markdown: string;
}

export interface ParsedLegalMarkdown {
  intro: string;
  sections: LegalMarkdownSection[];
  /** What would break the page's anchors, in words for the editor. */
  problems: string[];
}

const SECTION_HEADING =
  /^##(?!#)[ \t]+(.+?)(?:[ \t]+\{((?:[ \t]*#[^\s#{}]+)+)[ \t]*\})?[ \t]*$/u;
const VALID_ANCHOR = /^[a-z0-9][a-z0-9-]*$/u;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/u;

export function anchorFromHeading(heading: string) {
  return (
    heading
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/gu, "")
      .replace(/&/gu, " and ")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "section"
  );
}

export function parseLegalMarkdown(markdown: string): ParsedLegalMarkdown {
  const intro: string[] = [];
  const sections: (LegalMarkdownSection & { lines: string[] })[] = [];
  const problems: string[] = [];
  const used = new Set<string>();
  let fence: string | null = null;

  const claim = (anchor: string, heading: string) => {
    if (!VALID_ANCHOR.test(anchor)) {
      problems.push(
        `“#${anchor}” (${heading}): anchors use lower-case letters, digits and hyphens only.`,
      );
    } else if (used.has(anchor)) {
      problems.push(`“#${anchor}” is used by more than one section.`);
    }
    used.add(anchor);
  };

  for (const line of markdown.replace(/\r\n?/gu, "\n").split("\n")) {
    const fenceMark = FENCE.exec(line)?.[1];
    if (fenceMark) {
      if (fence === null) fence = fenceMark[0] ?? null;
      else if (fenceMark[0] === fence) fence = null;
    }
    const heading = fence === null ? SECTION_HEADING.exec(line) : null;
    if (heading?.[1]) {
      const title = heading[1].trim();
      const anchors = (heading[2] ?? "")
        .split("#")
        .map((anchor) => anchor.trim())
        .filter(Boolean);
      let id = anchors[0] ?? anchorFromHeading(title);
      if (!anchors[0]) {
        // A made-up anchor never clashes: it takes a number instead.
        for (let n = 2; used.has(id); n += 1)
          id = `${anchorFromHeading(title)}-${n}`;
        used.add(id);
      } else {
        claim(id, title);
      }
      const aliases = anchors.slice(1);
      for (const alias of aliases) claim(alias, title);
      sections.push({ id, aliases, title, markdown: "", lines: [] });
      continue;
    }
    (sections.at(-1)?.lines ?? intro).push(line);
  }

  return {
    intro: intro.join("\n").trim(),
    sections: sections.map(({ lines, ...section }) => ({
      ...section,
      markdown: lines.join("\n").trim(),
    })),
    problems,
  };
}

/** Links to the web, mail, phone, this site or this page; anything else is dropped. */
function safeLegalUrl(url: string) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|tel:|#)/iu.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return "";
}

const MARKDOWN_PLUGINS = [remarkGfm];

// The page has one h1 and its sections' h2s: headings written inside a
// section are sub-headings.
const COMPONENTS: Components = {
  h1: ({ node: _node, ...props }) => <h3 {...props} />,
  h2: ({ node: _node, ...props }) => <h3 {...props} />,
  a: ({ node: _node, href, children, ...props }) =>
    href?.startsWith("/") ? (
      <Link to={href} {...props}>
        {children}
      </Link>
    ) : (
      <a href={href} {...props}>
        {children}
      </a>
    ),
};

/**
 * Markdown as the legal pages show it. Raw HTML is not rendered and links
 * are limited to safe addresses, so the text cannot inject markup or script;
 * React builds the elements, so the prerendered HTML holds the full text.
 */
export function LegalMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_PLUGINS}
      skipHtml
      urlTransform={safeLegalUrl}
      components={COMPONENTS}
    >
      {markdown}
    </ReactMarkdown>
  );
}

/**
 * A page's saved text as the document the legal page layout shows, in the
 * same markup as the built-in documents: numbered sections with their
 * anchors, and empty elements carrying the old anchors.
 */
export function legalDocumentFromPage(
  builtIn: Pick<LegalDocument, "path">,
  page: Pick<
    LegalPage,
    "title" | "description" | "heading" | "effective" | "markdown"
  >,
  parsed: ParsedLegalMarkdown = parseLegalMarkdown(page.markdown),
): LegalDocument {
  return {
    path: builtIn.path,
    title: page.title,
    description: page.description,
    heading: page.heading,
    ...(page.effective ? { effective: page.effective } : {}),
    intro: parsed.intro ? <LegalMarkdown markdown={parsed.intro} /> : null,
    sections: parsed.sections.map(({ id, title }) => ({ id, title })),
    body: parsed.sections.map((section, index) => (
      <Fragment key={section.id}>
        {section.aliases.map((alias) => (
          <span
            key={alias}
            id={alias}
            aria-hidden="true"
            className="block scroll-mt-6"
          />
        ))}
        <section id={section.id}>
          <h2>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {section.title}
          </h2>
          <LegalMarkdown markdown={section.markdown} />
        </section>
      </Fragment>
    )),
  };
}
