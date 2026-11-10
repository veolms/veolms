import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const aboutDocument: LegalDocument = {
  path: "/about",
  title: "About ProCodrr",
  description:
    "Learn what ProCodrr offers and how Google sign-in is used to access learner accounts.",
  heading: "About ProCodrr",
  intro: (
    <>
      <p>
        ProCodrr is an online programming education platform offering practical
        courses and learning resources for software developers.
      </p>
    </>
  ),
  sections: [
    { id: "what-procodrr-offers", title: "What ProCodrr offers" },
    {
      id: "why-procodrr-uses-google-sign-in",
      title: "Why ProCodrr uses Google sign-in",
    },
  ],
  body: (
    <>
      <section id="what-procodrr-offers">
        <h2>
          <span>01</span>What ProCodrr offers
        </h2>
        <p>
          Learners can study JavaScript, Node.js, RegEx, Next.js, and other
          software development topics through in-depth video courses, guided
          practice, and projects. A ProCodrr learner account provides access to
          course enrollments and materials.
        </p>
      </section>
      <section id="why-procodrr-uses-google-sign-in">
        <h2>
          <span>02</span>Why ProCodrr uses Google sign-in
        </h2>
        <p>
          Learners can sign in at{" "}
          <a href="https://procodrr.com">procodrr.com</a>. Google sign-in
          verifies a learner’s identity and provides the basic Google account
          information needed to create or access a ProCodrr learner account.
        </p>
        <p>
          ProCodrr does not request access to a learner’s YouTube account or
          other Google services as part of this sign-in. Read the{" "}
          <Link to="/privacy">Privacy Policy</Link> for details about
          information handled during sign-in and course use.
        </p>
      </section>
    </>
  ),
};
