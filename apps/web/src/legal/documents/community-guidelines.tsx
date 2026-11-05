import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const communityGuidelinesDocument: LegalDocument = {
  path: "/community-guidelines",
  title: "Community Guidelines | ProCodrr",
  description:
    "Rules for respectful, helpful participation in ProCodrr course discussions, the Android app, and the ProCodrr Discord community.",
  heading: "Community Guidelines",
  effective: "Effective date: October 18, 2026",
  intro: (
    <>
      <p>
        These guidelines apply wherever ProCodrr learners talk to each other:
        course discussions on the learning platform and in the Android app, and
        the ProCodrr Discord server. They form part of our{" "}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    </>
  ),
  sections: [
    { id: "be-respectful", title: "Be respectful" },
    { id: "stay-on-topic", title: "Stay on topic" },
    {
      id: "no-self-promotion-or-advertising",
      title: "No self-promotion or advertising",
    },
    {
      id: "keep-content-appropriate-and-legal",
      title: "Keep content appropriate and legal",
    },
    { id: "respect-privacy", title: "Respect privacy" },
    { id: "reporting-a-problem", title: "Reporting a problem" },
    { id: "moderation", title: "Moderation" },
    { id: "enjoy-and-learn", title: "Enjoy and learn" },
  ],
  body: (
    <>
      <section id="be-respectful">
        <h2>
          <span>01</span>Be respectful
        </h2>
        <p>
          Treat everyone with respect. Harassment, bullying, hate speech,
          discrimination, threats, and personal attacks are not allowed. Be
          mindful of your language and avoid offensive, inappropriate, or
          inflammatory remarks. Everyone was a beginner once.
        </p>
      </section>
      <section id="stay-on-topic">
        <h2>
          <span>02</span>Stay on topic
        </h2>
        <p>
          Keep discussions relevant to the lesson or channel. Ask clear
          questions, share what you have tried, and reply where it helps. Do not
          spam, flood, or post the same question in several places.
        </p>
      </section>
      <section id="no-self-promotion-or-advertising">
        <h2>
          <span>03</span>No self-promotion or advertising
        </h2>
        <p>
          Do not promote your own or others’ channels, websites, products,
          services, or job offers. Sharing a genuinely useful resource that
          answers a question is welcome.
        </p>
      </section>
      <section id="keep-content-appropriate-and-legal">
        <h2>
          <span>04</span>Keep content appropriate and legal
        </h2>
        <p>
          Do not post sexually explicit content, violence, illegal material,
          malware, or pirated software, courses, or books, including ProCodrr
          courses. Do not share copied course videos or materials. Avoid
          spreading unverified or misleading information.
        </p>
      </section>
      <section id="respect-privacy">
        <h2>
          <span>05</span>Respect privacy
        </h2>
        <p>
          Do not share private information about yourself or anyone else, such
          as phone numbers, addresses, email addresses, or payment details. Do
          not post screenshots of private conversations without consent.
        </p>
      </section>
      <section id="reporting-a-problem">
        <h2>
          <span>06</span>Reporting a problem
        </h2>
        <p>
          If you see a post that breaks these rules, report it. In course
          discussions, use the <strong>Report</strong> option on the post and
          choose a reason; reports are confidential and the person reported does
          not see who filed it. On Discord, message a moderator or admin
          privately. You can also email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a> with a
          link or screenshot. We review every report, usually within 2 business
          days.
        </p>
      </section>
      <section id="moderation">
        <h2>
          <span>07</span>Moderation
        </h2>
        <p>
          Instructors, moderators, and admins may edit, hide, or remove content,
          and may warn, mute, restrict, or ban accounts, depending on how
          serious the breach is. Their decisions are final. If you are asked to
          stop a behaviour or move a discussion, please do so promptly. Repeated
          or serious breaches may lead to termination of your ProCodrr account
          under our Terms of Service, without a refund.
        </p>
      </section>
      <section id="enjoy-and-learn">
        <h2>
          <span>08</span>Enjoy and learn
        </h2>
        <p>
          Ask questions, share what you know, help others, and have fun learning
          and growing together. Thank you for being part of the ProCodrr
          community.
        </p>
      </section>
    </>
  ),
};
