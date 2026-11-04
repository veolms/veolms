import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const termsDocument: LegalDocument = {
  path: "/terms",
  title: "Terms of Service | ProCodrr",
  description:
    "Terms of Service for the ProCodrr website, learning platform, and Android app, provided by ProCodrr Labs LLP.",
  heading: "Terms of Service",
  effective:
    "Effective date: October 18, 2026 · Last updated: October 18, 2026",
  intro: (
    <>
      <p>
        These terms are an agreement between you and ProCodrr Labs LLP. They
        apply whenever you use the ProCodrr website, the ProCodrr learning
        platform, or the ProCodrr Android app.
      </p>
    </>
  ),
  sections: [
    {
      id: "who-we-are-and-what-these-terms-cover",
      title: "Who we are and what these terms cover",
    },
    { id: "who-may-use-the-services", title: "Who may use the Services" },
    { id: "your-account", title: "Your account" },
    {
      id: "courses-purchases-and-access",
      title: "Courses, purchases, and access",
    },
    { id: "the-android-app", title: "The Android app" },
    { id: "acceptable-use", title: "Acceptable use" },
    {
      id: "discussions-and-content-you-post",
      title: "Discussions and content you post",
    },
    {
      id: "procodrr-content-and-intellectual-property",
      title: "ProCodrr content and intellectual property",
    },
    { id: "third-party-services", title: "Third-party services" },
    {
      id: "availability-and-changes-to-the-services",
      title: "Availability and changes to the Services",
    },
    {
      id: "disclaimers-and-limitation-of-liability",
      title: "Disclaimers and limitation of liability",
    },
    {
      id: "suspension-termination-and-deleting-your-account",
      title: "Suspension, termination, and deleting your account",
    },
    { id: "governing-law-and-disputes", title: "Governing law and disputes" },
    { id: "changes-to-these-terms", title: "Changes to these terms" },
    {
      id: "contact-and-grievance-officer",
      title: "Contact and Grievance Officer",
    },
  ],
  body: (
    <>
      <section id="who-we-are-and-what-these-terms-cover">
        <h2>
          <span>01</span>Who we are and what these terms cover
        </h2>
        <p>
          ProCodrr Labs LLP (“ProCodrr”, “we”, “us”) is a limited liability
          partnership registered in India, based in Bengaluru, Karnataka. We
          provide online programming education: courses, lessons, exercises,
          projects, discussions, and the accounts that go with them.
        </p>
        <p>
          The <strong>“Services”</strong> means all of the following:
        </p>
        <ul>
          <li>the ProCodrr website at procodrr.com;</li>
          <li>
            the ProCodrr learning platform, the web application at procodrr.com;
          </li>
          <li>
            the ProCodrr Android app available on Google Play (the “app”), which
            presents the learning platform on your device; and
          </li>
          <li>any other ProCodrr app or service that links to these terms.</li>
        </ul>
        <p>
          By creating an account, making a purchase, installing the app, or
          otherwise using the Services, you agree to these terms and to our{" "}
          <Link to="/privacy">Privacy Policy</Link>, which explains how we
          handle your information. If you do not agree, do not use the Services.
        </p>
      </section>
      <section id="who-may-use-the-services">
        <h2>
          <span>02</span>Who may use the Services
        </h2>
        <p>
          You must be at least 13 years old to create an account. If you are
          under 18, you may use the Services only with the consent of a parent
          or guardian, who agrees to these terms on your behalf and must make
          any purchase for you. By using the Services you confirm that you meet
          these requirements and that you are not barred from using them under
          any applicable law.
        </p>
      </section>
      <section id="your-account">
        <h2>
          <span>03</span>Your account
        </h2>
        <p>
          You sign in with Google or with a one-time code sent to your email.
          Before your first purchase we ask you to verify a mobile number. You
          must give accurate information, keep your email and phone accessible,
          and keep your devices and Google account secure. You are responsible
          for everything done through your account. One account is for one
          person; do not share it or let others use your course access.
        </p>
        <p>
          If you think someone else has used your account, sign out of other
          devices from your settings and email{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>{" "}
          straight away. We may suspend or restrict an account where reasonably
          needed to protect learners, investigate misuse, or comply with law.
        </p>
      </section>
      <section id="courses-purchases-and-access">
        <h2>
          <span>04</span>Courses, purchases, and access
        </h2>
        <p>
          Course descriptions, prices, what is included, and the access period
          are shown on the course or checkout page at the time you buy. Prices
          are shown in Indian Rupees unless stated otherwise and include
          applicable taxes where the page says so. A purchase gives you a
          personal, limited, non-exclusive, non-transferable licence to access
          the purchased course for the stated access period, subject to these
          terms.
        </p>
        <p>
          <strong>Purchases are made on our website only.</strong> Payments are
          processed by Razorpay or by bank transfer as shown at checkout, and
          the payment provider’s terms apply to the payment itself. The Android
          app does not sell courses, does not process payments, and does not
          offer in-app purchases through Google Play. Courses you buy on the
          website are available in the app when you sign in with the same
          account.
        </p>
        <p>
          Refunds and cancellations are governed by our{" "}
          <Link to="/policies">Refund and Cancellation Policy</Link>. If a
          course page and these terms disagree about a specific purchase, the
          course or checkout details shown when you paid govern that purchase.
        </p>
      </section>
      <section id="the-android-app">
        <h2>
          <span>05</span>The Android app
        </h2>
        <p>
          We grant you a personal, non-transferable, revocable licence to
          install and use the app on Android devices you own or control, solely
          to access the Services in line with these terms. The app is licensed,
          not sold, to you.
        </p>
        <ul>
          <li>
            <strong>Google Play:</strong> you download the app from Google Play
            under the{" "}
            <a
              href="https://play.google.com/about/play-terms/"
              target="_blank"
              rel="noreferrer"
            >
              Google Play Terms of Service
            </a>
            . Google is not a party to these terms and has no obligation to
            provide support for the app. These terms are between you and
            ProCodrr only.
          </li>
          <li>
            <strong>Permissions:</strong> the app asks for permission to send
            notifications. You can refuse or revoke it at any time in Android
            settings; the app continues to work without it. If offline downloads
            are offered, downloaded lessons are stored in the app’s private
            storage, remain our content, are tied to your account and access
            period, and are removed when you sign out, delete your account, or
            uninstall the app.
          </li>
          <li>
            <strong>Updates:</strong> we may release updates that add, change,
            or remove features. Some updates may be required to keep using the
            app. We may stop supporting the app or particular Android versions
            with reasonable notice.
          </li>
          <li>
            <strong>Restrictions:</strong> you must not modify,
            reverse-engineer, decompile, repackage, or redistribute the app,
            extract downloaded lesson files, or bypass its security or content
            protection, except where the law expressly allows it despite this
            clause.
          </li>
          <li>
            <strong>Data and charges:</strong> the app streams video and may use
            significant mobile data. You are responsible for any charges from
            your network provider.
          </li>
        </ul>
      </section>
      <section id="acceptable-use">
        <h2>
          <span>06</span>Acceptable use
        </h2>
        <p>
          You may use the Services for lawful personal learning. You must not:
        </p>
        <ul>
          <li>
            share account credentials or sign-in codes, or let others use your
            course access;
          </li>
          <li>
            copy, record, screen-capture, download (except through a download
            feature we provide), republish, sell, or distribute course
            materials;
          </li>
          <li>
            scrape, crawl, or systematically extract content or data from the
            Services;
          </li>
          <li>
            circumvent access controls, signed video links, download protection,
            or other security measures;
          </li>
          <li>
            upload malware, probe or disrupt our systems, or attempt
            unauthorised access to any account or system;
          </li>
          <li>
            impersonate anyone, misrepresent your identity, or create accounts
            for someone else without permission;
          </li>
          <li>
            use the Services to harass or harm others, or in any way that breaks
            the law or infringes another person’s rights.
          </li>
        </ul>
      </section>
      <section id="discussions-and-content-you-post">
        <h2>
          <span>07</span>Discussions and content you post
        </h2>
        <p>
          Courses include discussions where you can ask questions, reply, and
          attach files. You keep ownership of what you post. You grant ProCodrr
          a worldwide, non-exclusive, royalty-free licence to host, display,
          reproduce, and distribute your posts within the Services so that other
          learners can see and respond to them, and to use them to operate,
          moderate, and improve the Services. This licence continues for posts
          that remain after you delete your account, which we keep in anonymised
          form as described in our Privacy Policy.
        </p>
        <p>
          You are responsible for what you post. Do not post anything illegal,
          infringing, hateful, harassing, sexually explicit, spam, or that
          reveals private information about anyone. Our{" "}
          <Link to="/community-guidelines">Community Guidelines</Link> set out
          the full rules. You can report a post from the discussion itself or by
          emailing us; we review reports and may remove content or restrict
          accounts that break the rules, without notice where the situation
          requires it. We do not pre-screen posts and are not responsible for
          what other learners post, but we will act on reports.
        </p>
      </section>
      <section id="procodrr-content-and-intellectual-property">
        <h2>
          <span>08</span>ProCodrr content and intellectual property
        </h2>
        <p>
          ProCodrr and its licensors own the Services and all course materials,
          including videos, lesson text, code samples, exercises, quizzes,
          graphics, the app, and the ProCodrr name and logo, except for material
          identified as belonging to someone else. They are protected by
          copyright, trademark, and other laws. Your purchase or use of the
          Services does not transfer ownership of any of it to you. Code samples
          in lessons may be used in your own projects unless a lesson says
          otherwise; the lessons themselves may not be redistributed.
        </p>
      </section>
      <section id="third-party-services">
        <h2>
          <span>09</span>Third-party services
        </h2>
        <p>
          Sign-in, payments, SMS and email delivery, hosting, and video delivery
          rely on third-party providers listed in our Privacy Policy. Links to
          YouTube, Discord, and other sites lead to services we do not control.
          Those services are governed by their own terms. ProCodrr is not
          responsible for a third party’s independent service, but contact us if
          a third-party issue stops you using a course you paid for.
        </p>
      </section>
      <section id="availability-and-changes-to-the-services">
        <h2>
          <span>10</span>Availability and changes to the Services
        </h2>
        <p>
          We work to keep the Services available and course content current, but
          access may be interrupted for maintenance, security, technical
          problems, or events outside our reasonable control. We may update,
          add, or retire parts of the Services or a course. If we retire a
          course you have paid for before your access period ends, we will offer
          a reasonable alternative or a proportionate refund.
        </p>
      </section>
      <section id="disclaimers-and-limitation-of-liability">
        <h2>
          <span>11</span>Disclaimers and limitation of liability
        </h2>
        <p>
          Courses are educational material. We do not guarantee a particular
          job, exam result, income, or learning outcome. To the fullest extent
          permitted by law, the Services are provided “as is” and “as
          available”, without warranties of any kind, and ProCodrr is not liable
          for indirect, incidental, special, or consequential loss, or for loss
          of data, profit, or opportunity, arising from use of the Services. Our
          total liability to you for any claim relating to the Services is
          limited to the amount you paid us in the 12 months before the claim
          arose. Nothing in these terms limits a right or remedy that cannot
          lawfully be limited, including your rights under the Consumer
          Protection Act, 2019.
        </p>
      </section>
      <section id="suspension-termination-and-deleting-your-account">
        <h2>
          <span>12</span>Suspension, termination, and deleting your account
        </h2>
        <p>
          You may stop using the Services at any time and may delete your
          account from Settings → Account or through our{" "}
          <Link to="/delete-account">account deletion page</Link>. Deleting your
          account ends your access to all courses, including paid ones, and
          cannot be undone.
        </p>
        <p>
          We may suspend or terminate your access if you materially breach these
          terms, create a security or legal risk, or if we must do so by law.
          Where practical we will tell you why and give you a chance to fix the
          problem. Termination for breach does not entitle you to a refund.
          Clauses that by their nature should survive, including sections 7, 8,
          11, and 13, continue after termination.
        </p>
      </section>
      <section id="governing-law-and-disputes">
        <h2>
          <span>13</span>Governing law and disputes
        </h2>
        <p>
          These terms are governed by the laws of India. Any dispute will be
          subject to the exclusive jurisdiction of the courts in Bengaluru,
          Karnataka, except that you may bring a consumer claim in the forum
          available to you under applicable consumer protection law. Before
          starting formal proceedings, please contact us so we can try to
          resolve the issue.
        </p>
      </section>
      <section id="changes-to-these-terms">
        <h2>
          <span>14</span>Changes to these terms
        </h2>
        <p>
          We may revise these terms as the Services or legal requirements
          change. The current version and its effective date are always at{" "}
          <a href="https://procodrr.com/terms">procodrr.com/terms</a>. For
          material changes we will notify you by email or in the app at least 15
          days before they take effect. Continued use after that date means the
          updated terms apply.
        </p>
      </section>
      <section id="contact-and-grievance-officer">
        <h2>
          <span>15</span>Contact and Grievance Officer
        </h2>
        <p>
          For questions about these terms, your account, or to raise a
          complaint, contact our Grievance Officer, Anurag Singh, at{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>. Our
          postal address is on the <Link to="/contact">Contact page</Link>. We
          acknowledge complaints within 48 hours and aim to resolve them within
          30 days.
        </p>
      </section>
    </>
  ),
};
