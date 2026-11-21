# Flow tests

End-to-end checks of what learners do, through the real API: sign in, join or
buy a course, watch its lessons, save progress, and what only staff may do.
Each test signs people up, makes courses and calls the API exactly as the web
app does; nothing is mocked inside the API.

| File                                      | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01-sign-in.flow.test.ts`                 | Emailed codes, wrong/used/expired codes, sign-out, the device limit                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `02-course-access.flow.test.ts`           | Which lessons play for whom: previews, free, paid, grants, archived                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `03-buying-a-course.flow.test.ts`         | Checkout, payment confirmation, webhooks, forged or repeated payments                                                                                                                                                                                                                                                                                                                                                                                                                |
| `04-learning-progress.flow.test.ts`       | Completion, course progress, resume on another device, late positions                                                                                                                                                                                                                                                                                                                                                                                                                |
| `05-staff-only.flow.test.ts`              | The admin area refuses learners and visitors; uploading and publishing                                                                                                                                                                                                                                                                                                                                                                                                               |
| `06-coupons-and-refunds.flow.test.ts`     | What coupons take off, refused coupons, refunds and what they revoke                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `07-international-prices.flow.test.ts`    | Dollar prices for buyers outside India, coupons on them, revenue in ₹                                                                                                                                                                                                                                                                                                                                                                                                                |
| `08-course-order.flow.test.ts`            | The admin's course order, on every list; who may set it                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `09-coupon-course-rates.flow.test.ts`     | One coupon with a different discount per course; rates it refuses                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `10-chat.flow.test.ts`                    | Chat: groups, retries, catch-up, mutes, helpers, private chats, live                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `11-email-lanes.flow.test.ts`             | Queued email: receipts before bulk mail, bulk cap, throttle pause, dead addresses, unsubscribe                                                                                                                                                                                                                                                                                                                                                                                       |
| `15-lesson-pdf-reading.flow.test.ts`      | Who is given a reading lesson's PDF; only the lesson page's own request                                                                                                                                                                                                                                                                                                                                                                                                              |
| `16-web-push.flow.test.ts`                | Browser push for chat: subscribe, encrypted delivery, mutes, retry, 410                                                                                                                                                                                                                                                                                                                                                                                                              |
| `18-push-actions.flow.test.ts`            | Reply / Mark as read from a phone notification: tokens, retries, stale                                                                                                                                                                                                                                                                                                                                                                                                               |
| `19-chat-push-pictures.flow.test.ts`      | Pictures in phone chat pushes: sender, reactor, course; none in private                                                                                                                                                                                                                                                                                                                                                                                                              |
| `19-legal-pages.flow.test.ts`             | Legal pages: read with the academy's details, rewrite, restore, who may                                                                                                                                                                                                                                                                                                                                                                                                              |
| `20-order-confirmation.flow.test.ts`      | The order page after paying: who may read it, each state, what items open, the welcome, the email                                                                                                                                                                                                                                                                                                                                                                                    |
| `22-payment-gateway.flow.test.ts`         | The academy's own Razorpay account: who may connect it, keys checked before they are kept, stored encrypted with their own key and never sent back, admins told of every change                                                                                                                                                                                                                                                                                                      |
| `23-course-sales-page.flow.test.ts`       | The course page's ready sections: who may edit them, what reaches the public page and in what order, testimonials waiting for "these are real", the instructor shown with their bio only when switched on, refused text, search fields                                                                                                                                                                                                                                               |
| `24-website-pages.flow.test.ts`           | Website pages: who may build them, templates, autosave with a two-tab guard, refused script links, publish to plain HTML with real courses, versions and rollback, a theme switch restyling live pages, links between pages, take down                                                                                                                                                                                                                                               |
| `26-affiliates.flow.test.ts`              | Affiliate links: one click per visit (not crawlers, not repeats within 30 minutes), a signed HttpOnly cookie for the window, unknown and suspended codes answered the same, credit to the last link or to a code typed at checkout, cross-device credit through the account, the window running out, no credit for an affiliate's own purchase and their own code refused, a forged cookie ignored, the program switched off, and an order still made when deciding the credit fails |
| `27-affiliate-payouts.flow.test.ts`       | The affiliate's side: applying (by invitation, with approval or automatically), codes and their clashes, rejection and applying again, payout details stored encrypted with only a hint sent back, payout requests (minimum, details, one open at a time, the same key answering the same payout), and the commission emails                                                                                                                                                         |
| `28-affiliate-admin.flow.test.ts`         | The admin's side: who may use it, switching the program on (the 20% default), rules replaced and never edited, approving, rejecting, invitations, suspending and reinstating (tracking, coupon, held commissions), the buyer discount on every coupon, flagged commissions, adjustments, re-crediting an order, payouts paid, rejected and failed, TDS, payouts for everyone owed, decrypted details and the CSV (audited), the weekly reminder, the overview and exports            |
| `21-marketing.flow.test.ts`               | Email marketing: who may use it, audiences and counts, sending, open and click tracking, unsubscribe, resend to non-openers, scheduling, the nudge-to-start automation                                                                                                                                                                                                                                                                                                               |
| `23-first-moves-and-handoff.flow.test.ts` | The admin home's first five moves (who may read them, what ticks them); the sign-in hand-over from another site (none without a provider, once only, new or existing account)                                                                                                                                                                                                                                                                                                        |

## Running them

They need the local Postgres (the one in `compose.yaml`) to be running:

```bash
docker compose up -d postgres
pnpm test:flows
```

Each run drops and rebuilds its own database, `veolms_flow_test`, so it
starts from the same state every time and never touches your development
database. To use another server, set `FLOW_TEST_DATABASE_URL` (its database
name must contain "test").

One file, or one test by name:

```bash
node apps/api/test/flows/setup/prepare-database.ts
node --test apps/api/test/flows/02-course-access.flow.test.ts
node --test --test-name-pattern="archived" apps/api/test/flows/02-course-access.flow.test.ts
```

## What is replaced

Only what lies outside the API:

- **Email**: captured, so a test reads the sign-in code the learner would get.
- **Payment gateway**: a fake Razorpay (`setup/fake-payment-gateway.ts`). Its
  signatures are real HMACs, so forged ones are refused as Razorpay's would be.
  Its refunds settle at once, and it refuses more than is left of a payment.
- **Video storage**: lessons are written with videos already transcoded
  (`setup/flow-courses.ts`). The API builds the video's CDN link and token
  without fetching anything, and storage points at an address that answers
  nothing, so a test that reached it would fail.
- **Uploads**: an in-memory store (`setup/fake-object-storage.ts`). The API
  signs upload links as usual; `flow.storage.upload(uploadUrl)` stands for
  the browser sending the file, and the API's check that the file arrived
  answers from it.

The same setup (this folder's `setup/`) also runs the API for the browser
tests in `apps/web/tests/journeys/`, on a database of their own
(`veolms_e2e_test`); `setup/flow-database.ts` rebuilds either one.

## Adding a test

When you fix a bug, add the test that would have caught it to the file for
its feature: write it first, watch it fail, then fix the bug. Name it as a
sentence about what a learner sees, like the others.
