import type { LegalPageTemplate } from "./index.ts";

export const privacyTemplate: LegalPageTemplate = {
  slug: "privacy",
  title: "Privacy Policy | {{academyName}}",
  description:
    "Privacy Policy for the {{academyName}} website, learning platform, and Android app, published by {{companyName}}. Learn what we collect, why, how long we keep it, and how to delete your account.",
  heading: "Privacy Policy",
  effective:
    "Effective date: October 18, 2026 · Last updated: October 18, 2026",
  markdown: `This policy explains how {{companyName}} handles your information when you use the {{academyName}} website, the {{academyName}} learning platform, or the {{academyName}} Android app. One policy covers all of them.

## Who we are and what this policy covers

The {{academyName}} services are provided by **{{companyName}}**, a limited liability partnership registered in India with its office in Bengaluru, Karnataka (“{{academyName}}”, “we”, “us”, or “our”). On Google Play our apps are published under the developer name **{{academyName}} Labs**. We are the data fiduciary (data controller) for the information described in this policy.

This policy applies to all of the following, which we call the **“Services”**:

- **The {{academyName}} website** at [{{siteUrl}}]({{siteUrl}}), where we describe our courses.
- **The {{academyName}} learning platform**, the web application where you sign in, buy courses, watch lessons, and take part in discussions. It is available at [{{siteUrl}}]({{siteUrl}}).
- **The {{academyName}} Android app** published on Google Play (the “app”). The app shows the learning platform inside a built-in browser view, so it handles your information in the same way as the learning platform, plus the app-specific items described below.
- Any other {{academyName}} app or service that links to this policy.

Where a practice applies only to the website, only to the learning platform, or only to the app, we say so. Everything else applies to all of the Services.

## Information we collect

We collect only what we need to run the Services. Here is everything, grouped by where it comes from.

### Information you give us

- **Account details:** your name, email address, username, and profile photo. If you sign in with Google, Google provides these along with a stable Google account identifier (see section 3). If you sign in with email, we send a one-time code to your address to verify it. We do not use passwords.
- **Mobile number:** before your first purchase or enrolment we ask you to verify a mobile number with a code sent by SMS. We use the country calling code of that number to determine your country for pricing, tax, and invoicing. A verified number can also receive a one-time code to sign you in; if your account has an email address, an unverified number is never used to sign you in. We do not collect your precise location.
- **Purchase details:** the courses you order, the amount paid, currency, payment status, the type of payment method used (for example card, UPI, or bank transfer), and any billing details you enter at checkout. Payments are processed by our payment provider; we never see or store your full card number, CVV, or bank password.
- **Content you post:** questions, replies, comments, and attachments you add to course discussions, notes you save, and reports you file about other content. Discussion posts are visible to other learners enrolled in the same course and show your name and profile photo.
- **Messages to us:** anything you include when you email support or contact us through the Services.
- **Security settings:** if you turn on two-step verification, we store the data needed for it, such as a passkey public key or an encrypted authenticator secret.

### Information created when you use the Services

- **Learning data:** your enrolments, which lessons you have opened and completed, your position in a video, quiz answers and scores, wishlist, and preferences such as theme or playback settings.
- **Session and security records:** when you sign in we record the date and time, the IP address, and the browser or device description (the “user agent”) of that session. We show you this list in your account settings so you can see where you are signed in and sign out of other devices. We also count one-time code requests per IP address to prevent abuse.
- **Server logs:** our servers keep standard technical logs of requests, including IP address, requested page or endpoint, timestamp, and error details, used to keep the Services running and secure.
- **Notifications:** a record of the in-app and email notifications we send you, such as replies to your discussion posts or purchase receipts.

### Information specific to the Android app

- **Device description:** the app identifies itself to our servers with the Android version and device model as part of the user agent, in the same way a browser does. We do not collect the Android advertising ID, IMEI, or any other hardware identifier.
- **Push notifications:** if you allow notifications, the app registers a push token with Google’s Firebase Cloud Messaging service so we can deliver notifications to your device. The token identifies the app installation, not you personally, and is deleted when you uninstall the app, turn notifications off, or delete your account.
- **Offline downloads:** when offline viewing is available, lesson files you choose to download are stored in the app’s private storage on your device. They are encrypted, tied to your account, and removed when you sign out, delete your account, or uninstall the app. We record which lessons you downloaded so we can manage your access.
- **Permissions:** the app asks for the notifications permission. If offline downloads are enabled, it uses the app’s own private storage and does not need access to your photos, files, or other apps. The app does not request camera, microphone, location, contacts, or SMS permissions.

### Cookies, local storage, and analytics

- **Learning platform and app:** we use only strictly necessary cookies and local storage to keep you signed in, protect against cross-site request forgery, and remember your settings. We do not use advertising cookies, cross-site tracking, or third-party analytics inside the learning platform or the app. Usage statistics we show to instructors (such as how many learners completed a lesson) are produced from the learning data described above on our own servers.
- **Website ({{siteUrl}} only):** our marketing website uses Google Analytics to understand how visitors find and use the site. Google Analytics sets cookies and collects your approximate location (city level, from your IP address), device and browser type, pages viewed, and referring site. You can opt out with the [Google Analytics opt-out add-on](https://tools.google.com/dlpage/gaoptout) or by blocking cookies in your browser.

### Information we do not collect

We do not collect precise location, contacts, photos or files other than those you choose to upload, call or SMS logs, health or financial account data, government identifiers, or biometric data. We do not buy data about you from third parties and we do not use advertising networks.

## How we use Google sign-in data

When you choose “Sign in with Google”, Google shares the basic profile information you approve: your name, email address, profile picture, and a stable Google account identifier. We use it only to create or find your {{academyName}} account, keep you signed in, show your name and photo in the Services, and associate your purchases and progress with your account.

{{academyName}} does not request access to your YouTube account, Gmail, Google Drive, contacts, calendar, or any other Google service. We do not use Google sign-in data for advertising, sell it, or use it to train generalised artificial intelligence or machine learning models.

Our use of information received from Google APIs complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. You can remove {{academyName}}’s access at any time from your Google Account’s [third-party connections](https://myaccount.google.com/connections) page.

## Why we use your information

We use the information above for these purposes:

- **To provide the Services:** create and secure your account, deliver the courses you bought, save your progress, run discussions, and show you notifications.
- **To process purchases:** take payment through our payment provider, issue invoices and receipts, apply the right tax for your country, and handle refunds.
- **To communicate with you:** send service messages such as sign-in codes, receipts, replies to your posts, security alerts, and answers to your support requests.
- **To send marketing, with your consent:** emails and, in the app, push notifications about new courses, offers, and sales. You can opt out at any time (see section 9).
- **To keep the Services safe:** detect and prevent fraud, abuse, account sharing, and unauthorised access, and enforce our [Terms of Service](/terms).
- **To improve the Services:** understand which lessons and features are used so we can fix problems and improve courses. We do this with aggregated data wherever possible.
- **To meet legal obligations:** keep tax and accounting records, respond to lawful requests, and resolve disputes.

Under India’s Digital Personal Data Protection Act, 2023 we process your information on the basis of your consent, given when you create an account or make a purchase, and for the legitimate uses the Act permits, such as providing a service you requested and complying with law. You can withdraw consent at any time by deleting your account or contacting us; this does not affect processing that already happened.

## Who we share information with

We do not sell personal information, and we do not share it with advertisers or data brokers. We share it only with the service providers below, who process it on our instructions to run the Services, and in the limited situations that follow.

| Provider | What they do for us | What they receive |
| --- | --- | --- |
| Google (Google LLC) | Sign in with Google; Google Play distribution of the app; Firebase Cloud Messaging for push notifications; Google Analytics on {{siteUrl}} | Sign-in identity; push token; website usage data |
| Razorpay Software Pvt. Ltd. | Payment processing and refunds | Name, email, mobile number, amount, order reference, payment details you enter on Razorpay’s pages |
| MSG91, and Vonage or Twilio as backup | Sending one-time codes by SMS | Mobile number and the code |
| Our email delivery provider | Sending sign-in codes, receipts, notifications, and marketing emails | Email address, name, message content |
| Contabo GmbH | Hosting our servers and database in India | All platform data |
| Cloudflare, Inc. | Storing and delivering course videos, images, uploads, and encrypted database backups; protecting the Services from attacks | Media files, profile photos, attachments, backups, IP address of requests |
| Amazon Web Services | Converting uploaded course videos into streaming formats | Course video files only; no learner data |
| DiceBear | Drawing default profile pictures | Your display name, or your account ID when no name is set, used to draw the picture; the IP address and browser details of the request that loads it |

**Other learners:** your name, profile photo, and anything you post in a course discussion are visible to other learners enrolled in that course and to our instructors and moderators. Your email and mobile number are shown to other learners only if you verify them and choose to show them on your public profile. Your purchase history is never shown to other learners.

**Legal and safety reasons:** we may disclose information where required by law, a court order, or a government request, or where reasonably necessary to protect learners, prevent fraud, or protect our rights and safety.

**Business changes:** if {{academyName}} is merged, acquired, or sells its assets, your information may be transferred to the new owner, who must continue to honour this policy. We will tell you before your information becomes subject to a different privacy policy.

## Where your information is stored

Our main database and application servers are hosted in India. Encrypted database backups and course media are stored with Cloudflare in the Asia-Pacific region. Some of our providers, such as Google, Cloudflare’s global network, and SMS carriers, may process information in other countries, including the United States, where data protection laws may differ from those in India. When that happens we rely on the provider’s contractual commitments to protect your information to a standard consistent with this policy.

## How long we keep information

We keep information only as long as needed for the purpose we collected it. Our standard retention periods are:

| Information | Kept for |
| --- | --- |
| Account, profile, learning progress, settings, wishlist, notes | While your account exists, then deleted within 30 days of your deletion request |
| Sign-in sessions (IP address, user agent) | 30 days after the session ends or is signed out |
| One-time sign-in codes and request counters | Codes expire within 10 minutes; counters are cleared within 24 hours |
| Server and security logs | Up to 90 days |
| Notification delivery records | 30 days |
| Orders, invoices, payment and refund records | Up to 8 years after the transaction, as required by Indian tax and accounting laws, even if you delete your account |
| Discussion posts and attachments | While the course exists. If your account is deleted, your posts stay in the discussion and are shown as posted by a “Deleted user”, with your name, username, photo, and account link removed |
| Support emails | Up to 2 years after the issue is closed |
| Encrypted database backups | Up to 30 days, after which deleted data no longer exists in any backup |
| Google Analytics data ({{siteUrl}} only) | Up to 14 months, controlled by our Google Analytics settings |

## Deleting your account

You can ask us to delete your {{academyName}} account and the personal information linked to it at any time by emailing [{{contactEmail}}](mailto:{{contactEmail}}?subject=Delete%20my%20account) from the email address on your account with the subject “Delete my account”. Our [account deletion page](/delete-account) gives the steps. We confirm the request within 48 hours and delete the account within 30 days.

When your account is deleted we permanently remove all of your private data: your name, username, email address, mobile number, profile photo, sign-in sessions, learning progress, wishlist, notes, notification history, push tokens, and any downloaded lesson files on your devices. Your course access ends and cannot be restored, including for courses you paid for.

Public comments you posted are not deleted, because others have replied to them; your name, username, and photo are removed and they are shown as posted by a “Deleted user”. We also keep order and invoice records (for tax purposes, without your account link) and records of fraud or abuse investigations. Section 7 lists how long each is kept. Deletion from backups completes within the backup retention period.

## Your choices and rights

- **Access and correction:** you can view and update your name, photo, and settings in your account. For anything else, or for a copy of your data, email us and we will provide it within 30 days.
- **Deletion:** see section 8.
- **Marketing emails:** every marketing email has an unsubscribe link. Service emails such as receipts and sign-in codes continue because they are needed to run your account.
- **Push notifications (app):** turn them off in the app’s notification settings or in your Android system settings for the {{academyName}} app.
- **Sessions:** review and sign out of other devices under Settings → Privacy & Security.
- **Google connection:** remove {{academyName}} from your Google Account’s third-party connections. You can still sign in with your email afterwards.
- **Cookies:** block or delete cookies in your browser. The learning platform needs its session cookie to keep you signed in.
- **Withdraw consent and complain:** you can withdraw consent, nominate someone to exercise your rights on your behalf, or raise a grievance with our Grievance Officer (section 14). If you are not satisfied with our response, you may complain to the Data Protection Board of India or the data protection authority where you live.

We do not discriminate against anyone for exercising these rights. We may ask you to verify your identity before acting on a request, usually by replying from the email address on your account.

## Security

All traffic between your device and our servers is encrypted with HTTPS. Sign-in codes are short-lived and single-use. Course videos are delivered through signed, expiring links. Authenticator secrets and payment-gateway credentials are encrypted at rest. Access to production systems is limited to staff who need it and is protected with two-step verification. You can add a passkey or authenticator app to your own account for extra protection.

No online service can guarantee absolute security. If you believe your account has been accessed without permission, sign out of other sessions from your settings and contact us immediately. If you find a security vulnerability in the Services, please report it to [{{contactEmail}}](mailto:{{contactEmail}}).

## Children and age limits

The Services are for people learning to program and are not directed at children under 13. You must be at least 13 years old to create an account. If you are under 18, you may use the Services only with the consent and involvement of a parent or guardian, who must make any purchase on your behalf.

We do not knowingly collect personal information from children under 13. If you believe a child under 13 has created an account, or a minor has used the Services without a parent’s consent, email us and we will delete the account and its information.

## Third-party sites and communities

The Services link to third-party sites and services, including our YouTube channel, social media pages, and the {{academyName}} Discord community. Those services have their own privacy policies, and this policy does not apply to information you share there. Our [Community Guidelines](/community-guidelines) apply to how you behave in our Discord and in course discussions.

## Changes to this policy

We will update this policy when our practices or the law change. The current version is always at [{{siteUrl}}/privacy]({{siteUrl}}/privacy) with its effective date. If a change materially reduces your rights or changes how we use information we already hold, we will notify you by email or in the app before it takes effect, and where consent is required we will ask for it.

## Contact and Grievance Officer

For any question, request, or complaint about this policy or your information, contact our Grievance Officer, appointed under the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023:

**{{grievanceOfficer}}**, Grievance Officer  
{{companyName}}  
Email: [{{contactEmail}}](mailto:{{contactEmail}})  
Postal address: see our [Contact page](/contact)  

We acknowledge grievances within 48 hours and aim to resolve them within 30 days. Please write from the email address on your account so we can verify that the request is yours.
`,
};
