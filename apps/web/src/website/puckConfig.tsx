import type { Config } from "@puckeditor/core";
import {
  SITE_SECTION_TYPES,
  SITE_THEMES,
  type SiteCourseCard,
  type SiteLook,
  type SiteSection,
  type SiteSectionType,
  type SiteThemeId,
} from "@veolms/contracts";
import {
  SECTION_DEFAULTS,
  renderSectionHtml,
  siteAttributes,
  siteCss,
} from "@veolms/site-render";
import type { MouseEvent } from "react";
import { SECTION_LABELS, sectionFields } from "./sectionFields";
import { editorRenderContext } from "./websiteHelpers";

/**
 * Passed to Puck as `metadata`. Plain data only: Puck copies metadata, so a
 * Map or a function inside it would not survive; the render context is
 * built from this in each preview.
 */
export interface WebsiteEditorMetadata {
  academyName: string;
  courses: SiteCourseCard[];
  pages: Array<{ id: string; slug: string }>;
  look: SiteLook;
}

/** Links in the preview must not navigate the editor's frame away. */
function stopLinks(event: MouseEvent) {
  if ((event.target as Element).closest("a")) event.preventDefault();
}

function previewMarkup(
  section: SiteSection,
  metadata: WebsiteEditorMetadata,
): string {
  try {
    // The same renderer as the live page, so the preview can't drift from
    // it. Its output escapes every value (see @veolms/site-render html.ts).
    return renderSectionHtml(section, editorRenderContext(metadata));
  } catch {
    // Half-edited settings must not take the whole editor down.
    return '<p class="vp-note">This section can’t be shown yet. Check its settings.</p>';
  }
}

function SectionPreview({
  type,
  props,
  metadata,
}: {
  type: SiteSectionType;
  props: Record<string, unknown>;
  metadata: WebsiteEditorMetadata;
}) {
  const { id, layout, ...settings } = props;
  const section = { id, type, layout, settings } as SiteSection;
  const markup = previewMarkup(section, metadata);
  return (
    <div
      onClickCapture={stopLinks}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/**
 * Puck's configuration: one component per section type, each previewed by
 * the shared renderer. New sections start with the theme's own layout.
 */
export function createWebsitePuckConfig(themeId: SiteThemeId): Config {
  const theme = SITE_THEMES[themeId];
  const components = Object.fromEntries(
    SITE_SECTION_TYPES.map((type) => [
      type,
      {
        label: SECTION_LABELS[type],
        fields: sectionFields(type),
        defaultProps: {
          layout: theme.defaultLayouts[type],
          ...structuredClone(SECTION_DEFAULTS[type]),
        },
        render: ({
          puck,
          ...props
        }: Record<string, unknown> & {
          puck: { metadata: Record<string, unknown> };
        }) => (
          <SectionPreview
            type={type}
            props={props}
            metadata={puck.metadata as unknown as WebsiteEditorMetadata}
          />
        ),
      },
    ]),
  );

  return {
    categories: {
      top: { title: "Top of the page", components: ["hero", "links"] },
      content: {
        title: "Content",
        components: ["features", "courses", "testimonials", "faq"],
      },
      end: { title: "End of the page", components: ["cta", "footer"] },
    },
    components,
    root: {
      fields: {
        title: { type: "text", label: "Title in search results" },
        description: {
          type: "textarea",
          label: "Description in search results",
        },
      },
      defaultProps: { title: "", description: "" },
      render: ({
        children,
        puck,
      }: {
        children: React.ReactNode;
        puck: { metadata: Record<string, unknown> };
      }) => {
        const { look } = puck.metadata as unknown as WebsiteEditorMetadata;
        return (
          <div
            className="vp-site"
            {...siteAttributes(look)}
            style={{ minHeight: "100vh" }}
          >
            {/* The page's own styles, inside the preview frame only. */}
            <style>{`body{margin:0}${siteCss(look)}`}</style>
            {children}
          </div>
        );
      },
    },
  } as unknown as Config;
}
