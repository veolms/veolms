import type { LegalPageTemplate } from "./index.ts";

export const aboutTemplate: LegalPageTemplate = {
  slug: "about",
  title: "About {{academyName}}",
  description:
    "Learn what {{academyName}} offers and how Google sign-in is used to access learner accounts.",
  heading: "About {{academyName}}",
  effective: null,
  markdown: `{{academyName}} is an online programming education platform offering practical courses and learning resources for software developers.

## What {{academyName}} offers

Learners can study JavaScript, Node.js, RegEx, Next.js, and other software development topics through in-depth video courses, guided practice, and projects. A {{academyName}} learner account provides access to course enrollments and materials.

## Why {{academyName}} uses Google sign-in

Learners can sign in at [{{siteUrl}}]({{siteUrl}}). Google sign-in verifies a learner’s identity and provides the basic Google account information needed to create or access a {{academyName}} learner account.

{{academyName}} does not request access to a learner’s YouTube account or other Google services as part of this sign-in. Read the [Privacy Policy](/privacy) for details about information handled during sign-in and course use.
`,
};
