import { AutoField, FieldLabel } from "@puckeditor/core";
import { createContext, useContext } from "react";
import {
  SITE_SAFE_HREF,
  type SiteCourseCard,
  type SiteLink,
} from "@veolms/contracts";
import { Checkbox } from "../components/Checkbox";

/**
 * Custom fields for the editor's side panel. They are built from Puck's own
 * field pieces (`FieldLabel`, `AutoField`) so they look like the fields
 * around them, which website-editor.css maps to our theme tokens.
 */

/** What the editor's pickers choose from: published courses, other pages. */
export interface WebsiteEditorChoices {
  courses: readonly SiteCourseCard[];
  pages: ReadonlyArray<{ id: string; title: string; slug: string }>;
}

export const WebsiteEditorChoicesContext = createContext<WebsiteEditorChoices>({
  courses: [],
  pages: [],
});

type LinkKind = SiteLink["kind"];

const LINK_KINDS: ReadonlyArray<{ label: string; value: LinkKind }> = [
  { label: "No link", value: "none" },
  { label: "All courses", value: "courses" },
  { label: "One course", value: "course" },
  { label: "Another page", value: "page" },
  { label: "A web address", value: "url" },
];

function emptyLink(kind: LinkKind, choices: WebsiteEditorChoices): SiteLink {
  switch (kind) {
    case "none":
      return { kind };
    case "courses":
      return { kind };
    case "course":
      return { kind, courseId: choices.courses[0]?.id ?? "" };
    case "page":
      return { kind, pageId: choices.pages[0]?.id ?? "" };
    case "url":
      return { kind, href: "https://" };
  }
}

function Hint({ children, error }: { children: string; error?: boolean }) {
  return (
    <p
      className={`m-0 mt-1.5 text-xs ${error ? "text-rose-500" : "text-(--muted)"}`}
    >
      {children}
    </p>
  );
}

/** Where a button goes: a course, a page or a web address, by reference. */
export function LinkControl({
  value,
  onChange,
  label,
}: {
  value: SiteLink | undefined;
  onChange: (value: SiteLink) => void;
  label: string;
}) {
  const choices = useContext(WebsiteEditorChoicesContext);
  const link = value ?? { kind: "none" };
  const urlInvalid =
    link.kind === "url" &&
    link.href !== "https://" &&
    !SITE_SAFE_HREF.test(link.href.trim());
  return (
    <FieldLabel label={label}>
      <div className="grid gap-2">
        <AutoField
          field={{ type: "select", options: LINK_KINDS }}
          value={link.kind}
          onChange={(kind: LinkKind) => onChange(emptyLink(kind, choices))}
        />
        {link.kind === "course" ? (
          choices.courses.length === 0 ? (
            <Hint>Publish a course to link to it.</Hint>
          ) : (
            <AutoField
              field={{
                type: "select",
                options: choices.courses.map((course) => ({
                  label: course.title,
                  value: course.id,
                })),
              }}
              value={link.courseId}
              onChange={(courseId: string) =>
                onChange({ kind: "course", courseId })
              }
            />
          )
        ) : null}
        {link.kind === "page" ? (
          choices.pages.length === 0 ? (
            <Hint>Add another page to link to it.</Hint>
          ) : (
            <AutoField
              field={{
                type: "select",
                options: choices.pages.map((page) => ({
                  label: `${page.title} (/${page.slug})`,
                  value: page.id,
                })),
              }}
              value={link.pageId}
              onChange={(pageId: string) => onChange({ kind: "page", pageId })}
            />
          )
        ) : null}
        {link.kind === "url" ? (
          <>
            <AutoField
              field={{ type: "text", placeholder: "https://" }}
              value={link.href}
              onChange={(href: string) => onChange({ kind: "url", href })}
            />
            {urlInvalid ? (
              <Hint error>Use an address that starts with https://</Hint>
            ) : null}
          </>
        ) : null}
      </div>
    </FieldLabel>
  );
}

/** Ticks the courses a "picked" course grid shows, in the order ticked. */
export function CoursePickerControl({
  value,
  onChange,
  label,
}: {
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  label: string;
}) {
  const { courses } = useContext(WebsiteEditorChoicesContext);
  const picked = value ?? [];
  return (
    <FieldLabel label={label} el="div">
      {courses.length === 0 ? (
        <Hint>Your published courses will be listed here.</Hint>
      ) : (
        <div className="grid max-h-64 gap-0.5 overflow-y-auto">
          {courses.map((course) => (
            <Checkbox
              key={course.id}
              id={`pick-${course.id}`}
              checked={picked.includes(course.id)}
              label={course.title}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...picked, course.id].slice(0, 12)
                    : picked.filter((id) => id !== course.id),
                )
              }
            />
          ))}
        </div>
      )}
      <Hint>Used when “Which courses” is “Ones I pick”.</Hint>
    </FieldLabel>
  );
}
