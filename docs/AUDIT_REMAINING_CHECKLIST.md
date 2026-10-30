# What is left after the audit: checklist

Updated 14 Oct 2026, after the stylesheet round, and tidied so that every open box below is really open. The full record is `docs/AUDIT_RECONCILIATION_2026-10-11.md`, sections 19 to 30. This file is the short list to work from. Tick a box when it is done.

## Done in phases 1 to 3 (13 Oct)

- [x] Staff can see payments that need a manual refund, at the top of the Orders page: extra gateway payments, and courses paid for twice.
- [x] A manual payment and a gateway payment arriving together no longer fail with a database error.
- [x] A quiz payment that fails to verify now waits and tells the buyer not to pay again.
- [x] A restricted free course no longer shows "Enroll for Free". It says enrollment is by invitation.
- [x] A creator can remove a course's category.
- [x] A lesson whose quiz was deleted says "This lesson has no video" and can be completed.
- [x] Profile changes (name, photo, phone, email) show at once.
- [x] Upload limits hold when many files arrive together.
- [x] A wrong one-word address says "Page not found", also for signed-out visitors.
- [x] Quiz drafts and the last-opened lesson stay with their own account.
- [x] Coupon errors name the right problem.
- [x] Short usernames: no code needed. The account can pick a longer one in Settings today.

## Done in the open-bug round (13 Oct)

- [x] A course with a lesson that has no video can be published, and published again.
- [x] When a lesson gets its first video, its "complete" tick is cleared for everyone, so it has to be watched.
- [x] A bank transfer reported for an order the gateway already paid is on the staff refund list, with a Reject button.
- [x] Course level can be cleared.
- [x] Catalogue cards say "View Course", not "Enroll Now", on a restricted free course.
- [x] Signed-out `/auth` says "Page not found".
- [x] Two files sent to one upload slot no longer leave an untracked file.
- [x] Settings tells an account when its username is too short for a profile page.
- [x] Checked, no change needed: a quiz stays when a lesson becomes a video lesson, and a lesson can have both.

## Done in the third round (13 Oct)

- [x] Staff can record a refund they made outside the platform, for an order paid by bank transfer. Full or partial. The buyer is told and gets a credit note.
- [x] Learners who passed a lesson's quiz keep their tick when the lesson gets a video later.
- [x] The same bundle paid twice is on the staff refund list.
- [x] A course bought directly and again inside a bundle is on the staff refund list.
- [x] A bank transfer reported for a cancelled or failed order is on the staff refund list.
- [x] The catalogue card shows the true progress percent.

## Done in the fourth round (13 Oct)

- [x] Refunding one item of a bundle acts on what was sold, also when the bundle was edited later.
- [x] Approving a learner's refund request on a bank-transfer order takes the transfer reference in the same step. API only: see section D.
- [x] Staff who cannot reject a transfer request see "Ask an admin to reject this request." instead of a button that refuses.
- [x] `level: "all_levels"` on the direct course update clears the level.
- [x] Local file store: two uploads with one name no longer lose the file.
- [x] Purchase History filters and searches on the server, over all purchases (F2).
- [x] The tab title shows the course and the lesson (F17).
- [x] Analytics trend label shows the right day (F18).
- [x] No extra request after sign-out (A6).
- [x] No wasted request after a quiz is handed in (F8).
- [x] A moderator's delete removes the reply's mentions (B5c).
- [x] The whole app was run in a browser against a local API. Wrong addresses, the restricted course, the amount box, sign-up at phone size, free enrolment, Purchase History, the staff refund notice, the bank-transfer refund dialog and the Reject button were seen working.

## Done in the fifth round (14 Oct)

- [x] The wishlist is saved on the account, not only in the browser (F10). A guest's saved courses move to the account at sign-in.
- [x] Signed-out API callers are told to sign in before they are told what is wrong with the request (B9).
- [x] The direct course update refuses a stale version (B8).
- [x] Fewer wasted requests on a locked lesson (F7).
- [x] A guest on the Enrolled tab is asked to log in (F13).
- [x] One search shortcut hook instead of five copies (F11).
- [x] The quiz countdown redraws only itself each second (P3).
- [x] Accent text passes the contrast check on all 16 palettes, light and dark (X2).
- [x] Unused `axios` removed (R5).
- [x] Video player lint findings fixed; the rules are back on.
- [x] Lint warnings down from 31 to 23.
- [x] Checked, no change needed: notifications already stop polling in a hidden tab; the two unused payment statuses harm nothing (C10.4).
- [x] Razorpay test mode: orders are created, bad signatures are refused, a refused refund leaves the order paid.

## Done in the sixth round (14 Oct)

- [x] The login page shows its frame and a loading card while the session is checked (A2).
- [x] The Courses filter stays where it was after the course editor (F14).
- [x] Razorpay test purchase done by the owner: declined, successful, refund. All worked.
- [x] Production counts run by the owner: all zero.

## Done in the seventh round (14 Oct)

- [x] The lesson page reads a lesson's description from its own request (P1, steps 1 and 2). A switch is ready to shrink the course overview.
- [x] Queries moved out of services into repositories, with identical responses on 608 requests (R4).
- [x] The course page has share tags that follow the course (F17).
- [x] Notifications uses the shared search shortcut; Ctrl+K and Cmd+K both work outside text fields (F11).
- [x] Lint warnings down from 23 to 12.

## Done in the double-payment round (14 Oct)

- [x] The amount or coupon cannot be changed while a checkout for that purchase may still be open.
- [x] Two overlapping purchases (a course and a bundle that holds it) cannot both be open.
- [x] A bundle is refused if the buyer owns any of its courses.
- [x] A reported bank transfer closes Pay for that purchase until staff answer; an open checkout closes transfer reporting.
- [x] Two requests at the same instant give one open order.
- [x] The payment window closes itself after 10 minutes.

## Done after the independent review (14 Oct)

- [x] Three reviewers read everything from rounds 4 to 8. No high-severity bug. Twelve findings fixed (section 28).
- [x] A late "payment failed" notice no longer blocks the buyer for another 12 minutes.
- [x] Two requests at the same instant can no longer leave two payable gateway orders.
- [x] Refunding only the quiz item of an order removes the quiz pass.
- [x] Quick wishlist clicks no longer undo each other.

## Done in the owner's decisions round (14 Oct)

- [x] An extra payment is refunded to the buyer automatically.
- [x] Free enrolment is instant.
- [x] A bank transfer can be reported at once, withdrawn by the buyer, and stops blocking after 7 days.
- [x] Archived courses: students keep access; nobody can buy them.
- [x] A sale price of 0 makes the course free.
- [x] The low-risk observations from section 26.2.
- [x] Text lessons wait for their text, so the overview switch is safe.
- [x] Share previews can carry the page address.
- [x] Staging checks of section B: confirmed working by the owner.

## A. Right after each push

Pushing `dev` deploys the API and the web together. These are yours: they need the deployed servers or their settings.

- [ ] Confirm the deploy finished and these migrations ran: `20261013100000-shorten-legacy-user-names`, `20261013110000-lowercase-user-emails`, `20261013120000-create-order-item-courses`, `20261014100000-create-wishlist-items`, `20261015100000-manual-payment-withdrawn`.
- [x] Run the count file on the production database. Done by the owner on 14 Oct: every count is 0.
- [x] Check 5 (accounts sharing an email in different letter case): 0 found. Nothing to merge.
- [ ] Set `VITE_SITE_URL` (for example `https://dev.veolms.org`) in the environment of the build that deploys the web. Share previews then carry the page address.
- [ ] **One release after this one:** set `COURSE_OVERVIEW_LESSON_DESCRIPTIONS=false` on the API. The course overview shrinks to about a sixth for a long course. Text lessons are safe with it.
- [ ] Run PageSpeed on dev.veolms.org, mobile and desktop, and compare with the baseline in `docs/performance-report.md`. Only a local production build was measured (section 30).
- [ ] Check the server's `TRUST_PROXY` value (section 18 of the report says which value fits which setup).
- [ ] Check that every address people sign in from is in `WEB_URL` or `CORS_ORIGINS`.

## B. Try these on staging or a real device

- [x] All the staging and device checks listed here until 14 Oct: confirmed working by the owner, including the Razorpay test purchase (declined, paid, refunded).
- [ ] After this deploy: report a bank transfer for an order, withdraw it, then pay by card or UPI. Pay should work again at once.
- [ ] After this deploy: pay an old payment window after changing the amount. The extra payment should come back by itself and not appear in the staff refund notice.
- [ ] After this deploy: archive a course you are enrolled in. You keep it in "My courses" and can watch it; a new account cannot buy it.
- [ ] Before turning it on: run the upload clean-up once against real storage.

## C. Decisions only you can make

- [x] All decisions of 14 Oct are taken (section 29 of the report): automatic refund of extra payments, instant free enrolment, bank transfer at once with withdraw and a 7-day limit, bundle refused for any course already held, one refund reference per order, archived courses kept by students and not sold, sale price 0 free, low-risk observations of section 26.2 fixed, API tests kept.
- [ ] **Deferred by you, for a later version:** enforce the "allow downloads" setting; per-creator payment gateways (endpoints kept, not supported); official definitions of progress and net revenue (current calculation stays); upload clean-up (stays off); a screen for refund requests (the refund button is enough).

## D. Bugs still open

None that code can fix. Accepted as they are:

- [ ] **Three rare double-payment cases** cannot be stopped before the money moves: a UPI request approved very late, a double capture by Razorpay on one order, and one person using two accounts. The first is now refunded automatically; the second is not caught; the third is out of reach.
- [ ] **Bundle orders paid before 13 Oct** are not compared course by course: what they contained when sold was never recorded.

## E. Put off because it needs a browser or new API work

- [x] **P2.** Stylesheet loading. Prerendered pages paint from inline critical CSS; first paint on a phone profile is about 35 to 45 percent faster (section 30).
- [x] **F17.** Share tags, including the page address once `VITE_SITE_URL` is set (section 29).
- [ ] **R1, R2.** Very large files and direct imports. Paused by you until the colleagues' course page work is finished; no change to logic or design when it is done.
- [ ] **R3.** Inline styles. Skipped by your decision.

## F. Code quality

- [x] **Production build of the web.** Built and measured locally with your permission (section 30).
- [x] **Section 26.2 observations.** Fixed (section 29).
- [ ] **12 lint warnings** remain: 5 library notices and 7 that need a behaviour change. Left by your decision. `pnpm lint` passes with 0 errors.
- [ ] **15 queries still outside repositories:** the reminder worker, the OTP locks, the health ping, commerce and courses. Left by your decision.
- [ ] **Memory regression suite.** `apps/web/AGENTS.md` asks for one before every web commit. It does not exist in the repository.
