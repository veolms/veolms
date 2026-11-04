import { Link } from "react-router";
import type { LegalDocument } from "../legalDocument";

export const privacyDocument: LegalDocument = {
  path: "/privacy",
  title: "Privacy Policy | ProCodrr",
  description:
    "Privacy Policy for the ProCodrr website, learning platform, and Android app, published by ProCodrr Labs LLP. Learn what we collect, why, how long we keep it, and how to delete your account.",
  heading: "Privacy Policy",
  effective:
    "Effective date: October 18, 2026 · Last updated: October 18, 2026",
  intro: (
    <>
      <p>
        This policy explains how ProCodrr Labs LLP handles your information when
        you use the ProCodrr website, the ProCodrr learning platform, or the
        ProCodrr Android app. One policy covers all of them.
      </p>
    </>
  ),
  sections: [
    { id: "scope", title: "Who we are and what this policy covers" },
    { id: "collect", title: "Information we collect" },
    { id: "google", title: "How we use Google sign-in data" },
    { id: "use", title: "Why we use your information" },
    { id: "share", title: "Who we share information with" },
    { id: "location", title: "Where your information is stored" },
    { id: "retention", title: "How long we keep information" },
    { id: "delete", title: "Deleting your account" },
    { id: "rights", title: "Your choices and rights" },
    { id: "security", title: "Security" },
    { id: "children", title: "Children and age limits" },
    { id: "third-party", title: "Third-party sites and communities" },
    { id: "changes", title: "Changes to this policy" },
    { id: "contact", title: "Contact and Grievance Officer" },
  ],
  body: (
    <>
      <section id="scope">
        <h2>
          <span>01</span>Who we are and what this policy covers
        </h2>
        <p>
          The ProCodrr services are provided by{" "}
          <strong>ProCodrr Labs LLP</strong>, a limited liability partnership
          registered in India with its office in Bengaluru, Karnataka
          (“ProCodrr”, “we”, “us”, or “our”). On Google Play our apps are
          published under the developer name <strong>ProCodrr Labs</strong>. We
          are the data fiduciary (data controller) for the information described
          in this policy.
        </p>
        <p>
          This policy applies to all of the following, which we call the{" "}
          <strong>“Services”</strong>:
        </p>
        <ul>
          <li>
            <strong>The ProCodrr website</strong> at{" "}
            <a href="https://procodrr.com">procodrr.com</a>, where we describe
            our courses.
          </li>
          <li>
            <strong>The ProCodrr learning platform</strong>, the web application
            where you sign in, buy courses, watch lessons, and take part in
            discussions. It is available at{" "}
            <a href="https://procodrr.com">procodrr.com</a>.
          </li>
          <li>
            <strong>The ProCodrr Android app</strong> published on Google Play
            (the “app”). The app shows the learning platform inside a built-in
            browser view, so it handles your information in the same way as the
            learning platform, plus the app-specific items described below.
          </li>
          <li>Any other ProCodrr app or service that links to this policy.</li>
        </ul>
        <p>
          Where a practice applies only to the website, only to the learning
          platform, or only to the app, we say so. Everything else applies to
          all of the Services.
        </p>
      </section>
      <section id="collect">
        <h2>
          <span>02</span>Information we collect
        </h2>
        <p>
          We collect only what we need to run the Services. Here is everything,
          grouped by where it comes from.
        </p>
        <h3>Information you give us</h3>
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address,
            username, and profile photo. If you sign in with Google, Google
            provides these along with a stable Google account identifier (see
            section 3). If you sign in with email, we send a one-time code to
            your address to verify it. We do not use passwords.
          </li>
          <li>
            <strong>Mobile number:</strong> before your first purchase or
            enrolment we ask you to verify a mobile number with a code sent by
            SMS. We use the country calling code of that number to determine
            your country for pricing, tax, and invoicing. We do not use your
            number to sign you in and we do not collect your precise location.
          </li>
          <li>
            <strong>Purchase details:</strong> the courses you order, the amount
            paid, currency, payment status, the type of payment method used (for
            example card, UPI, or bank transfer), and any billing details you
            enter at checkout. Payments are processed by our payment provider;
            we never see or store your full card number, CVV, or bank password.
          </li>
          <li>
            <strong>Content you post:</strong> questions, replies, comments, and
            attachments you add to course discussions, notes you save, and
            reports you file about other content. Discussion posts are visible
            to other learners enrolled in the same course and show your name and
            profile photo.
          </li>
          <li>
            <strong>Messages to us:</strong> anything you include when you email
            support or contact us through the Services.
          </li>
          <li>
            <strong>Security settings:</strong> if you turn on two-step
            verification, we store the data needed for it, such as a passkey
            public key or an encrypted authenticator secret.
          </li>
        </ul>
        <h3>Information created when you use the Services</h3>
        <ul>
          <li>
            <strong>Learning data:</strong> your enrolments, which lessons you
            have opened and completed, your position in a video, quiz answers
            and scores, wishlist, and preferences such as theme or playback
            settings.
          </li>
          <li>
            <strong>Session and security records:</strong> when you sign in we
            record the date and time, the IP address, and the browser or device
            description (the “user agent”) of that session. We show you this
            list in your account settings so you can see where you are signed in
            and sign out of other devices. We also count one-time code requests
            per IP address to prevent abuse.
          </li>
          <li>
            <strong>Server logs:</strong> our servers keep standard technical
            logs of requests, including IP address, requested page or endpoint,
            timestamp, and error details, used to keep the Services running and
            secure.
          </li>
          <li>
            <strong>Notifications:</strong> a record of the in-app and email
            notifications we send you, such as replies to your discussion posts
            or purchase receipts.
          </li>
        </ul>
        <h3>Information specific to the Android app</h3>
        <ul>
          <li>
            <strong>Device description:</strong> the app identifies itself to
            our servers with the Android version and device model as part of the
            user agent, in the same way a browser does. We do not collect the
            Android advertising ID, IMEI, or any other hardware identifier.
          </li>
          <li>
            <strong>Push notifications:</strong> if you allow notifications, the
            app registers a push token with Google’s Firebase Cloud Messaging
            service so we can deliver notifications to your device. The token
            identifies the app installation, not you personally, and is deleted
            when you uninstall the app, turn notifications off, or delete your
            account.
          </li>
          <li>
            <strong>Offline downloads:</strong> when offline viewing is
            available, lesson files you choose to download are stored in the
            app’s private storage on your device. They are encrypted, tied to
            your account, and removed when you sign out, delete your account, or
            uninstall the app. We record which lessons you downloaded so we can
            manage your access.
          </li>
          <li>
            <strong>Permissions:</strong> the app asks for the notifications
            permission. If offline downloads are enabled, it uses the app’s own
            private storage and does not need access to your photos, files, or
            other apps. The app does not request camera, microphone, location,
            contacts, or SMS permissions.
          </li>
        </ul>
        <h3>Cookies, local storage, and analytics</h3>
        <ul>
          <li>
            <strong>Learning platform and app:</strong> we use only strictly
            necessary cookies and local storage to keep you signed in, protect
            against cross-site request forgery, and remember your settings. We
            do not use advertising cookies, cross-site tracking, or third-party
            analytics inside the learning platform or the app. Usage statistics
            we show to instructors (such as how many learners completed a
            lesson) are produced from the learning data described above on our
            own servers.
          </li>
          <li>
            <strong>Website (procodrr.com only):</strong> our marketing website
            uses Google Analytics to understand how visitors find and use the
            site. Google Analytics sets cookies and collects your approximate
            location (city level, from your IP address), device and browser
            type, pages viewed, and referring site. You can opt out with the{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noreferrer"
            >
              Google Analytics opt-out add-on
            </a>{" "}
            or by blocking cookies in your browser.
          </li>
        </ul>
        <h3>Information we do not collect</h3>
        <p>
          We do not collect precise location, contacts, photos or files other
          than those you choose to upload, call or SMS logs, health or financial
          account data, government identifiers, or biometric data. We do not buy
          data about you from third parties and we do not use advertising
          networks.
        </p>
      </section>
      <section id="google">
        <h2>
          <span>03</span>How we use Google sign-in data
        </h2>
        <p>
          When you choose “Sign in with Google”, Google shares the basic profile
          information you approve: your name, email address, profile picture,
          and a stable Google account identifier. We use it only to create or
          find your ProCodrr account, keep you signed in, show your name and
          photo in the Services, and associate your purchases and progress with
          your account.
        </p>
        <p>
          ProCodrr does not request access to your YouTube account, Gmail,
          Google Drive, contacts, calendar, or any other Google service. We do
          not use Google sign-in data for advertising, sell it, or use it to
          train generalised artificial intelligence or machine learning models.
        </p>
        <p>
          Our use of information received from Google APIs complies with the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. You can remove ProCodrr’s
          access at any time from your Google Account’s{" "}
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noreferrer"
          >
            third-party connections
          </a>{" "}
          page.
        </p>
      </section>
      <section id="use">
        <h2>
          <span>04</span>Why we use your information
        </h2>
        <p>We use the information above for these purposes:</p>
        <ul>
          <li>
            <strong>To provide the Services:</strong> create and secure your
            account, deliver the courses you bought, save your progress, run
            discussions, and show you notifications.
          </li>
          <li>
            <strong>To process purchases:</strong> take payment through our
            payment provider, issue invoices and receipts, apply the right tax
            for your country, and handle refunds.
          </li>
          <li>
            <strong>To communicate with you:</strong> send service messages such
            as sign-in codes, receipts, replies to your posts, security alerts,
            and answers to your support requests.
          </li>
          <li>
            <strong>To send marketing, with your consent:</strong> emails and,
            in the app, push notifications about new courses, offers, and sales.
            You can opt out at any time (see section 9).
          </li>
          <li>
            <strong>To keep the Services safe:</strong> detect and prevent
            fraud, abuse, account sharing, and unauthorised access, and enforce
            our <Link to="/terms">Terms of Service</Link>.
          </li>
          <li>
            <strong>To improve the Services:</strong> understand which lessons
            and features are used so we can fix problems and improve courses. We
            do this with aggregated data wherever possible.
          </li>
          <li>
            <strong>To meet legal obligations:</strong> keep tax and accounting
            records, respond to lawful requests, and resolve disputes.
          </li>
        </ul>
        <p>
          Under India’s Digital Personal Data Protection Act, 2023 we process
          your information on the basis of your consent, given when you create
          an account or make a purchase, and for the legitimate uses the Act
          permits, such as providing a service you requested and complying with
          law. You can withdraw consent at any time by deleting your account or
          contacting us; this does not affect processing that already happened.
        </p>
      </section>
      <section id="share">
        <h2>
          <span>05</span>Who we share information with
        </h2>
        <p>
          We do not sell personal information, and we do not share it with
          advertisers or data brokers. We share it only with the service
          providers below, who process it on our instructions to run the
          Services, and in the limited situations that follow.
        </p>
        <div>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>What they do for us</th>
                <th>What they receive</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Google (Google LLC)</td>
                <td>
                  Sign in with Google; Google Play distribution of the app;
                  Firebase Cloud Messaging for push notifications; Google
                  Analytics on procodrr.com
                </td>
                <td>Sign-in identity; push token; website usage data</td>
              </tr>
              <tr>
                <td>Razorpay Software Pvt. Ltd.</td>
                <td>Payment processing and refunds</td>
                <td>
                  Name, email, mobile number, amount, order reference, payment
                  details you enter on Razorpay’s pages
                </td>
              </tr>
              <tr>
                <td>MSG91, and Vonage or Twilio as backup</td>
                <td>Sending one-time codes by SMS</td>
                <td>Mobile number and the code</td>
              </tr>
              <tr>
                <td>Our email delivery provider</td>
                <td>
                  Sending sign-in codes, receipts, notifications, and marketing
                  emails
                </td>
                <td>Email address, name, message content</td>
              </tr>
              <tr>
                <td>Contabo GmbH</td>
                <td>Hosting our servers and database in India</td>
                <td>All platform data</td>
              </tr>
              <tr>
                <td>Cloudflare, Inc.</td>
                <td>
                  Storing and delivering course videos, images, uploads, and
                  encrypted database backups; protecting the Services from
                  attacks
                </td>
                <td>
                  Media files, profile photos, attachments, backups, IP address
                  of requests
                </td>
              </tr>
              <tr>
                <td>Amazon Web Services</td>
                <td>
                  Converting uploaded course videos into streaming formats
                </td>
                <td>Course video files only; no learner data</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Other learners:</strong> your name, profile photo, and
          anything you post in a course discussion are visible to other learners
          enrolled in that course and to our instructors and moderators. Your
          email, mobile number, and purchase history are never shown to other
          learners.
        </p>
        <p>
          <strong>Legal and safety reasons:</strong> we may disclose information
          where required by law, a court order, or a government request, or
          where reasonably necessary to protect learners, prevent fraud, or
          protect our rights and safety.
        </p>
        <p>
          <strong>Business changes:</strong> if ProCodrr is merged, acquired, or
          sells its assets, your information may be transferred to the new
          owner, who must continue to honour this policy. We will tell you
          before your information becomes subject to a different privacy policy.
        </p>
      </section>
      <section id="location">
        <h2>
          <span>06</span>Where your information is stored
        </h2>
        <p>
          Our main database and application servers are hosted in India.
          Encrypted database backups and course media are stored with Cloudflare
          in the Asia-Pacific region. Some of our providers, such as Google,
          Cloudflare’s global network, and SMS carriers, may process information
          in other countries, including the United States, where data protection
          laws may differ from those in India. When that happens we rely on the
          provider’s contractual commitments to protect your information to a
          standard consistent with this policy.
        </p>
      </section>
      <section id="retention">
        <h2>
          <span>07</span>How long we keep information
        </h2>
        <p>
          We keep information only as long as needed for the purpose we
          collected it. Our standard retention periods are:
        </p>
        <div>
          <table>
            <thead>
              <tr>
                <th>Information</th>
                <th>Kept for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Account, profile, learning progress, settings, wishlist, notes
                </td>
                <td>
                  While your account exists, then deleted within 30 days of your
                  deletion request
                </td>
              </tr>
              <tr>
                <td>Sign-in sessions (IP address, user agent)</td>
                <td>30 days after the session ends or is signed out</td>
              </tr>
              <tr>
                <td>One-time sign-in codes and request counters</td>
                <td>
                  Codes expire within 10 minutes; counters are cleared within 24
                  hours
                </td>
              </tr>
              <tr>
                <td>Server and security logs</td>
                <td>Up to 90 days</td>
              </tr>
              <tr>
                <td>Notification delivery records</td>
                <td>30 days</td>
              </tr>
              <tr>
                <td>Orders, invoices, payment and refund records</td>
                <td>
                  Up to 8 years after the transaction, as required by Indian tax
                  and accounting laws, even if you delete your account
                </td>
              </tr>
              <tr>
                <td>Discussion posts and attachments</td>
                <td>
                  While the course exists. If your account is deleted, your
                  posts stay in the discussion and are shown as posted by a
                  “Deleted user”, with your name, username, photo, and account
                  link removed
                </td>
              </tr>
              <tr>
                <td>Support emails</td>
                <td>Up to 2 years after the issue is closed</td>
              </tr>
              <tr>
                <td>Encrypted database backups</td>
                <td>
                  Up to 30 days, after which deleted data no longer exists in
                  any backup
                </td>
              </tr>
              <tr>
                <td>Google Analytics data (procodrr.com only)</td>
                <td>
                  Up to 14 months, controlled by our Google Analytics settings
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section id="delete">
        <h2>
          <span>08</span>Deleting your account
        </h2>
        <p>
          You can ask us to delete your ProCodrr account and the personal
          information linked to it at any time by emailing{" "}
          <a href="mailto:contact@procodrr.com?subject=Delete%20my%20account">
            contact@procodrr.com
          </a>{" "}
          from the email address on your account with the subject “Delete my
          account”. Our <Link to="/delete-account">account deletion page</Link>{" "}
          gives the steps. We confirm the request within 48 hours and delete the
          account within 30 days.
        </p>
        <p>
          When your account is deleted we permanently remove all of your private
          data: your name, username, email address, mobile number, profile
          photo, sign-in sessions, learning progress, wishlist, notes,
          notification history, push tokens, and any downloaded lesson files on
          your devices. Your course access ends and cannot be restored,
          including for courses you paid for.
        </p>
        <p>
          Public comments you posted are not deleted, because others have
          replied to them; your name, username, and photo are removed and they
          are shown as posted by a “Deleted user”. We also keep order and
          invoice records (for tax purposes, without your account link) and
          records of fraud or abuse investigations. Section 7 lists how long
          each is kept. Deletion from backups completes within the backup
          retention period.
        </p>
      </section>
      <section id="rights">
        <h2>
          <span>09</span>Your choices and rights
        </h2>
        <ul>
          <li>
            <strong>Access and correction:</strong> you can view and update your
            name, photo, and settings in your account. For anything else, or for
            a copy of your data, email us and we will provide it within 30 days.
          </li>
          <li>
            <strong>Deletion:</strong> see section 8.
          </li>
          <li>
            <strong>Marketing emails:</strong> every marketing email has an
            unsubscribe link. Service emails such as receipts and sign-in codes
            continue because they are needed to run your account.
          </li>
          <li>
            <strong>Push notifications (app):</strong> turn them off in the
            app’s notification settings or in your Android system settings for
            the ProCodrr app.
          </li>
          <li>
            <strong>Sessions:</strong> review and sign out of other devices
            under Settings → Privacy &amp; Security.
          </li>
          <li>
            <strong>Google connection:</strong> remove ProCodrr from your Google
            Account’s third-party connections. You can still sign in with your
            email afterwards.
          </li>
          <li>
            <strong>Cookies:</strong> block or delete cookies in your browser.
            The learning platform needs its session cookie to keep you signed
            in.
          </li>
          <li>
            <strong>Withdraw consent and complain:</strong> you can withdraw
            consent, nominate someone to exercise your rights on your behalf, or
            raise a grievance with our Grievance Officer (section 14). If you
            are not satisfied with our response, you may complain to the Data
            Protection Board of India or the data protection authority where you
            live.
          </li>
        </ul>
        <p>
          We do not discriminate against anyone for exercising these rights. We
          may ask you to verify your identity before acting on a request,
          usually by replying from the email address on your account.
        </p>
      </section>
      <section id="security">
        <h2>
          <span>10</span>Security
        </h2>
        <p>
          All traffic between your device and our servers is encrypted with
          HTTPS. Sign-in codes are short-lived and single-use. Course videos are
          delivered through signed, expiring links. Authenticator secrets and
          payment-gateway credentials are encrypted at rest. Access to
          production systems is limited to staff who need it and is protected
          with two-step verification. You can add a passkey or authenticator app
          to your own account for extra protection.
        </p>
        <p>
          No online service can guarantee absolute security. If you believe your
          account has been accessed without permission, sign out of other
          sessions from your settings and contact us immediately. If you find a
          security vulnerability in the Services, please report it to{" "}
          <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>.
        </p>
      </section>
      <section id="children">
        <h2>
          <span>11</span>Children and age limits
        </h2>
        <p>
          The Services are for people learning to program and are not directed
          at children under 13. You must be at least 13 years old to create an
          account. If you are under 18, you may use the Services only with the
          consent and involvement of a parent or guardian, who must make any
          purchase on your behalf.
        </p>
        <p>
          We do not knowingly collect personal information from children under
          13. If you believe a child under 13 has created an account, or a minor
          has used the Services without a parent’s consent, email us and we will
          delete the account and its information.
        </p>
      </section>
      <section id="third-party">
        <h2>
          <span>12</span>Third-party sites and communities
        </h2>
        <p>
          The Services link to third-party sites and services, including our
          YouTube channel, social media pages, and the ProCodrr Discord
          community. Those services have their own privacy policies, and this
          policy does not apply to information you share there. Our{" "}
          <Link to="/community-guidelines">Community Guidelines</Link> apply to
          how you behave in our Discord and in course discussions.
        </p>
      </section>
      <section id="changes">
        <h2>
          <span>13</span>Changes to this policy
        </h2>
        <p>
          We will update this policy when our practices or the law change. The
          current version is always at{" "}
          <a href="https://procodrr.com/privacy">procodrr.com/privacy</a> with
          its effective date. If a change materially reduces your rights or
          changes how we use information we already hold, we will notify you by
          email or in the app before it takes effect, and where consent is
          required we will ask for it.
        </p>
      </section>
      <section id="contact">
        <h2>
          <span>14</span>Contact and Grievance Officer
        </h2>
        <p>
          For any question, request, or complaint about this policy or your
          information, contact our Grievance Officer, appointed under the
          Information Technology Act, 2000 and the Digital Personal Data
          Protection Act, 2023:
        </p>
        <address>
          <strong>Anurag Singh</strong>, Grievance Officer
          <br />
          ProCodrr Labs LLP
          <br />
          Email: <a href="mailto:contact@procodrr.com">contact@procodrr.com</a>
          <br />
          Postal address: see our <Link to="/contact">Contact page</Link>
        </address>
        <p>
          We acknowledge grievances within 48 hours and aim to resolve them
          within 30 days. Please write from the email address on your account so
          we can verify that the request is yours.
        </p>
      </section>
    </>
  ),
};
