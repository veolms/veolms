# Email delivery

How queued notification email leaves the platform, and what to set up so a
course-wide notice to thousands of learners never delays a sign-in code or a
receipt, and so Gmail and Yahoo keep accepting the mail.

## Two lanes

Every queued email (`notification_deliveries`, channel `email`) is in a lane:

| Lane            | What                                                                                                     | How it is sent                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `transactional` | Caused by one person's own action: a receipt, a reply to them, a refund, a mention                       | Always first, up to `NOTIFICATION_BATCH_SIZE` per cycle                                                                |
| `bulk`          | Sent to everyone in a course or to many people at once: course published, quiz assigned, daily reminders | After transactional mail, at most `NOTIFICATION_BULK_PER_CYCLE` per cycle (default 20 every 5 s, about 14,000 an hour) |

A handler marks an intent `lane: "bulk"` (`notifications.handlers.ts`);
everything else is transactional. Sign-in codes do not use the queue at all.

Only one process sends at a time (a Postgres advisory lock taken for the
cycle), so `EMAIL_RATE_PER_SECOND` is the rate the provider sees, however
many API replicas run the inline worker. Outbox and push processing stay
parallel.

## When the provider says no

`email-failure.ts` reads the SMTP reply:

- **Throttled** (`421`, `45x`, or any reply mentioning quota, rate, "too
  many", "try again later", including Gmail's `550 5.4.5 Daily user sending
limit exceeded`): the message goes back to the queue without burning an
  attempt, and its lane rests for `NOTIFICATION_THROTTLE_PAUSE_SECONDS`
  (default 15 min). The log says `Email lane paused`.
- **Dead address** (`550 5.1.1`, "no such user", ...): the delivery fails and
  the address is added to `email_suppressions`; no later email is queued
  for it.
- **Policy refusal** (`5.7.x`, "unauthenticated", "spam", "blocked"): the
  delivery fails and the lane rests. Check the DNS section below.
- **Anything else** (network, timeout, mailbox full): the usual backoff
  (`NOTIFICATION_RETRY_SECONDS`), then `failed` after
  `NOTIFICATION_EMAIL_MAX_ATTEMPTS`.

A batch that has used half its lease extends it, so a slow provider cannot
make another worker re-claim and re-send what is still in flight.

## Headers and unsubscribe

Every queued email carries `X-Entity-Ref-ID` (its delivery id, so Gmail does
not thread notices together) and, when `EMAIL_REPLY_TO` is set, `Reply-To`.
Optional notices (anything a learner can switch off in Settings →
Notifications) also carry:

- `List-Unsubscribe: <https://api…/v1/email/unsubscribe/<token>>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- a footer link to the same address

The token names the recipient and the group of emails (course updates,
reminders, ...) and is signed with `SESSION_SECRET`; it is valid for 180 days
and can only turn emails off. A mail client POSTs to it; a person who clicks
the footer link sees a page with one button. Both write the person's
`notification_preferences` (email off for every type in the group), which
the settings page shows and can undo. Bulk-lane mail also carries
`Precedence: bulk` and `Auto-Submitted: auto-generated`.

`EMAIL_API_URL` must be the address mail clients can reach the API at
(`https://api.example.com`); unset, `WEB_URL/api` is assumed.

## Re-publishing a course

Learners are told when a course is published the first time. A re-publish
after edits sends nothing unless the request asks:
`POST /v1/courses/:id/publish?notifyLearners=true`.

## Settings

| Variable                              | Default | Meaning                                                  |
| ------------------------------------- | ------- | -------------------------------------------------------- |
| `EMAIL_FROM`                          |         | Sender; its domain must pass SPF/DKIM (below)            |
| `EMAIL_REPLY_TO`                      | unset   | A mailbox someone reads                                  |
| `EMAIL_RATE_PER_SECOND`               | 5       | Sends per second handed to the provider                  |
| `EMAIL_API_URL`                       | unset   | Public API address for unsubscribe links                 |
| `NOTIFICATION_BULK_PER_CYCLE`         | 20      | Bulk emails per worker cycle (0 pauses bulk mail)        |
| `NOTIFICATION_THROTTLE_PAUSE_SECONDS` | 900     | How long a lane rests after a throttle or policy refusal |
| `NOTIFICATION_COURSE_WIDE_EMAIL`      | true    | false keeps course-wide notices in-app and push only     |
| `NOTIFICATION_INLINE_WORKER`          | true    | false on API processes when a dedicated worker runs      |

## DNS for the sending domain (do this before turning bulk mail on)

Gmail and Yahoo need, for every sender: SPF **or** DKIM aligned with the
`From` domain, a `_dmarc` record, and a `From` that is not the receiving
provider's. For anyone near 5,000 messages a day to Gmail: SPF **and** DKIM
**and** DMARC, one-click unsubscribe (done above), and a spam rate under
0.3 % (aim for 0.1 %) in Google Postmaster Tools.

Checklist for the domain in `EMAIL_FROM`:

1. `TXT @` with `v=spf1 include:<provider> ~all` (one SPF record only).
2. The provider's DKIM CNAME or TXT records, and DKIM signing turned on
   for that exact domain.
3. `TXT _dmarc` with `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` to
   start, `p=quarantine` once reports show alignment.
4. Prefer a subdomain for platform mail (`mail.example.com`) so a bad day
   never affects the team's own mailboxes, and never send automated mail
   through a personal mailbox's SMTP (Zoho Mail and Gmail forbid it).
5. Register the domain in Google Postmaster Tools and watch spam rate and
   domain reputation.

## Watching it

- The ops heartbeat log line carries `emailBacklog` (pending + processing
  email rows).
- `Email lane paused` warnings mean the provider throttled or refused mail;
  more than a few a day means the rate or the DNS is wrong.
- `Notification email failed permanently` errors with `suppressed: true`
  are dead addresses; others are refusals worth reading.
- `select lane, status, count(*) from notification_deliveries where channel = 'email' group by 1, 2;`
