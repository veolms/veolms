# Team management — plan

## 1. What we want

An admin builds **roles** by ticking **permissions**, then adds people to the
team in three ways:

- **Promote an existing user:** for example a student, or anyone already
  signed up. The admin picks the person and assigns roles. The change takes
  effect at once, with no invite.
- **Add by email:** the admin types an email and picks roles. The person has
  nothing to accept: the next time they sign in with that email, using an
  email OTP (or Google with the same email), the roles are already theirs.
  This works whether or not they have an account yet.
- **Invite by email:** the same, plus an invitation email with a link and an
  **Accept** step. Use it when you want the person to agree before joining.

Each member then:

- sees only the sidebar items and pages their permissions allow;
- is refused by the API (403) for anything else, even when they type the URL
  by hand.

## 2. How it will look

A new **Team** item in the admin sidebar opens `/team`. The page has three
tabs, laid out like the Platform page.

**Members**

- A table of team members: name and avatar, email, role chips, date joined,
  last active.
- Each row has a menu with **Change roles** and **Remove**.
- An **Add member** button opens a drawer:
  - search existing accounts by name or email;
  - pick roles;
  - save.

  The person is promoted at once and gets a short "You've been added to the
  team" email.

  If nobody matches, the drawer offers two choices for that email:
  - **Add by email:** roles apply on their first sign-in;
  - **Send invite:** the same, but they accept first.

- **Members waiting for first sign-in.** People added by email who have not
  signed in yet show in the Members table with a "Waiting for first sign-in"
  chip. Their row menu has **Change roles** and **Cancel**.
- **Promote from elsewhere:** the Students list row menu and the Student
  details page also get a **Make team member** action. It opens the same
  role picker.

**Roles**

- One card per role, showing:
  - name and description;
  - number of permissions and number of members;
  - a "System" badge on built-in roles.
- The **role editor** has:
  - name and description fields;
  - one section per area (Courses, Lessons, Quizzes, Students, Orders,
    Coupons, Analytics, Platform, Team…);
  - one checkbox per permission, with a short help text;
  - a "select all" checkbox per section.
- Ticking a permission also ticks the ones it needs. For example,
  "Manage coupons" also ticks "View coupons".
- Built-in roles open read-only, with a **Duplicate** button. Custom roles
  can be edited and deleted.

**Invitations**

- A list of invites only, not people added by email. Each invite has a
  status: pending, accepted, expired or revoked.
  Each invite has **Resend** and **Revoke**.
- **Invite people** opens a drawer:
  - paste one or more emails;
  - pick roles;
  - add an optional message.

  It then shows the result for each email.

**Accepting an invite**

- The invitee gets an email with a link to `/invite/<token>`. The page shows
  the academy, who invited them and which roles they will get.
- Signed out: they sign in with the usual login pop-up, then press
  **Accept**.
- Signed in with a different email: the page explains this and offers to
  switch account.
- Expired, revoked or already used: the page says so and tells them to ask
  for a new invite.
- After accepting, they land on the first module they can open.

## 3. What we already have

### Data (already in the DB)

| Table                       | Holds                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `permissions`               | one row per permission key                                                                                     |
| `roles`                     | `name` (unique), `description`, `is_system`                                                                    |
| `role_permissions`          | role → permission, with `allow` or `deny` (deny wins)                                                          |
| `role_assignments`          | user → role, either for the whole platform or for one course (`course_id`), plus `expires_at` and `created_by` |
| `user_roles`                | **old** user → role table. It is still what most checks read (see below).                                      |
| `menus`, `menu_permissions` | **old** sidebar stored in the DB. The web app does not use it.                                                 |

- **Permission keys.** 56 keys in `packages/contracts/src/permissions.ts`.
  They cover course, lesson, quiz, assignment, submission, enrollment,
  discussion, analytics, certificate, billing and `role.*`.
- **Built-in roles.** 9 roles are seeded in
  `packages/database/src/seed-rbac.ts`: admin, instructor, student,
  course_manager, content_editor, thumbnail_editor, teaching_assistant,
  reviewer, analytics_viewer. Admin gets every permission.

### API

- **Permission check.** `authorize(permission, scope)` in
  `apps/api/src/modules/authorization/authorization.guard.ts`.
  - It works out the course from the URL or body.
  - It reads both `role_assignments` and `user_roles`.
  - Today it is used by courses, curriculum, course settings, publish, media
    and analytics.
- **`GET /me/capabilities`** returns the current user's permissions.
- **The problem: most admin routes still check role names**
  (`requireRoles`, `requireAdmin`, `requireStaff`, about 86 places).
  - These read only the old `user_roles` table, so a custom role would not
    count.
  - Routes affected: quizzes, coupons, enrollments, refunds, manual payments,
    payment gateway, bundles, course access, students, categories, course
    bin, platform settings, branding, home page settings and platform
    moderation.
  - Many services also check "is owner or is admin". Examples: course
    ownership (`courses/shared/courses.utils.ts`), coupons, students,
    analytics, media. Orders also let any admin through.
- **No team API.** Nothing lists members, edits roles or assigns roles. The
  `createRoleAssignmentRequestSchema` contract exists but is unused.
- **No invitations.**
- **Email can be sent** with `services.email.send` (nodemailer). Its
  templates are in `packages/services/src/email/email.templates.ts`.

### Web

- **Sidebar is hardcoded.** `apps/web/src/shell/navigation.ts` has three
  fixed lists, Student, Creator and Admin, picked by role name.
- **Route and page checks use role names.**
  - Routes: `routing/routeAccess.ts`, `routing/RouteGuards.tsx`.
  - Pages: Platform, Coupons, the Analytics admin tabs, Student details, and
    the admin settings.
- **`useCapabilities()` exists** in
  `services/authorization/authorization.queries.ts` and offers `can(key)`.
  Only the dashboard route uses it.
- **No Team page.** Pages to copy from:
  - the Platform page (tabs);
  - the Students and Coupons tables;
  - `ElevatedCard`, `SlideOverPanel`, `Checkbox`, `ConfirmDeleteModal`;
  - toasts.

### Known seed issue

The `instructor` role has no `course.create`, `course.publish`,
`course.unpublish`, `course.archive` or `course.delete`, yet the course
routes require them. Fix this as part of the work.

## 4. What we need to build

### 4.1 One source of truth for access

- Only `role_assignments` + `role_permissions` grant access.
- Until every role-name check is gone:
  - `request.user.roles` must also include roles from `role_assignments`
    (`listUserRoleNames` in `auth/authentication/authentication.repository.ts`);
  - every role write (signup, CLI) writes to both tables.
- Later, delete `user_roles`, `menus`, `menu_permissions` and
  `GET /navigation/sidenav`.

### 4.2 New permissions

Add these keys to contracts, the seed, and a migration that also grants them
to admin:

| Area      | Keys                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Team      | `team.read`, `team.invite`, `team.update`, `team.remove` (plus the existing `role.*`)                        |
| Students  | `student.read`, `student.contact.update`, `student.access.manage`                                            |
| Coupons   | `coupon.read`, `coupon.manage`, `coupon.delete`                                                              |
| Commerce  | `refund.review`, `payment.manual.verify`, `payment.gateway.manage`, `bundle.manage`                          |
| Catalogue | `category.manage`, `course.restore`                                                                          |
| Platform  | `platform.settings.read`, `platform.settings.update`, `platform.branding.update`, `platform.homepage.update` |

Also add a **permission catalogue** in contracts. It groups the keys by area,
and each key gets a label, a help text, and `implies` (the keys it needs).
The role editor is drawn from this catalogue. Add a test that every key
belongs to exactly one group.

### 4.3 Rules (enforced in the API)

1. **Built-in roles** cannot be edited or deleted. **Admin** always has every
   permission.
2. **No privilege escalation.** You can only create, edit or assign a role if
   you hold every permission in it (admin can do anything).
3. **Never remove the last admin** (409 `LAST_ADMIN`). You cannot take away
   your own team or role permissions.
4. **A role with members cannot be deleted** (409 `ROLE_IN_USE`).
5. **"Owner or admin" becomes "owner, or has the permission"** (for the whole
   platform or for that course). Use one shared helper, for example
   `canActOnCourse(userId, permission, courseId)`.
6. **Changes apply on the next request.** The API reads the DB each time. The
   web app refetches capabilities after any team change.
7. **Every team action writes an event to the outbox:** invited, revoked,
   joined, roles changed, removed, role created, updated or deleted. These
   events are for a future audit log.
8. **Team members need two-factor sign-in, like admins** (to confirm).

### 4.4 API: new `apps/api/src/modules/team/` module (roles/, members/, invitations/)

| Endpoint                             | Permission                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET/POST /team/roles`               | `role.read` / `role.create`                                                                                                                                                 |
| `PATCH/DELETE /team/roles/:roleId`   | `role.update` / `role.delete`                                                                                                                                               |
| `GET /team/members` (search, paging) | `team.read`. Also returns pre-approved emails with status `awaiting_sign_in`.                                                                                               |
| `GET /team/users/search?q=`          | `role.assign` (any existing account by name/email, max 10, flags who is already on the team)                                                                                |
| `PUT /team/members/:userId/roles`    | `role.assign`. Promotes an existing user or changes a member's roles (full replace, one transaction). Sends the "added to the team" email after commit.                     |
| `DELETE /team/members/:userId`       | `team.remove`                                                                                                                                                               |
| `GET/POST /team/invitations`         | `team.read` / `team.invite`. POST takes `kind: 'invite' \| 'preapproved'` and a `notify` flag (send a "you've been added, sign in with this email" email for pre-approved). |
| `POST /team/invitations/:id/resend`  | `team.invite` (rate-limited)                                                                                                                                                |
| `PATCH /team/invitations/:id`        | `team.invite` (change roles of a pending row)                                                                                                                               |
| `DELETE /team/invitations/:id`       | `team.invite` (revoke / cancel)                                                                                                                                             |
| `GET /invitations/:token`            | public preview                                                                                                                                                              |
| `POST /invitations/:token/accept`    | signed in; their verified email must match the invite                                                                                                                       |

Contracts go in `packages/contracts/src/team.ts`: role, member, invitation
and invitation preview schemas, plus their requests.

**Invitation details**

Invitations and "add by email" share the same tables. A `kind` column tells
them apart.

- New tables:
  - `team_invitations`: email, `kind` (`invite` | `preapproved`),
    `token_hash` (invites only), `invited_by`, message, `expires_at`,
    `accepted_at`, `accepted_user_id`, `revoked_at`;
  - `team_invitation_roles`.
- Only one live row per email.
- **Token:** 32 random bytes. Store only its sha256. Invites expire after
  7 days. Pre-approved rows have no expiry by default.
- **Claim on sign-in.** This is how "add by email" works.
  - After any successful sign-in or sign-up, the auth module calls a team
    service: `claimPendingTeamAccess(userId, verifiedEmail)`. This covers
    email OTP login, OTP signup, Google and other OAuth.
  - The service turns every live `preapproved` row for that email into role
    assignments and marks the row accepted. It runs in the same transaction
    as the session.
  - The email must be **verified**: a successful OTP or the provider's
    verified email.
  - Export the call from `modules/team/index.ts`. The auth module must not
    reach into team repositories.
- **Do not pre-create user accounts.** No account exists until the person
  signs in. This avoids ghost accounts and clashes with Google sign-in.
  Today, OTP for an unknown email already starts signup
  (`resolveOtpPurpose` in `modules/auth/otp/otp.service.ts`), so no new
  login path is needed.
- **Email already belongs to a verified account.** "Add by email" becomes a
  plain promote, applied at once.
- **Sending:**
  - send through a new `teamInvitationEmail` template. Promoting an
    existing user uses a second new template, `teamMemberAddedEmail`;
  - send after the DB commit;
  - a failed send must not fail the request, because the invite can be
    resent.
- **Accepting:** in one transaction, create the role assignments and mark the
  invite accepted. Accepting twice as the same user does nothing new.
- **Public preview:** return the same answer for unknown and expired tokens,
  so nobody can probe which emails were invited.

### 4.5 API: switch every route to permission checks

Replace the role-name checks and "is admin" branches with `authorize(...)`
and the helper from 4.3. Admin and instructor must keep exactly what they can
do today.

| Module                                      | Permission                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| quizzes, quiz pricing, quiz analytics       | `quiz.*`, `submission.read/grade` (per course)                                          |
| course includes                             | `course.details.update`                                                                 |
| categories, course bin                      | `category.manage`, `course.restore` / `course.delete`                                   |
| orders                                      | `billing.read` / `billing.manage` (remove the admin bypass)                             |
| coupons                                     | `coupon.read/manage/delete`                                                             |
| enrollments                                 | `enrollment.read`                                                                       |
| refunds, manual payments, gateway, bundles  | `refund.review`, `payment.manual.verify`, `payment.gateway.manage`, `bundle.manage`     |
| course access, students                     | `student.access.manage`, `student.read`, `student.contact.update`                       |
| platform settings, branding, home page      | `platform.settings.read/update`, `platform.branding.update`, `platform.homepage.update` |
| discussion moderation (course and platform) | `discussion.moderate`                                                                   |
| analytics, media services                   | replace the `isAdmin` checks with permission checks                                     |

For each module, add API tests for four cases:

- admin is allowed;
- a custom role with the key is allowed;
- a custom role without the key gets 403;
- a student gets 403.

### 4.6 Web

- **Team page.** Route `team/:teamTab?` in `apps/web/src/team/`, with the
  three tabs from section 2. Data calls go in `apps/web/src/services/team/`.
  Follow `apps/web/AGENTS.md`.
- **Invite page.** `invite/:token`, a public route.
- **Sidebar from permissions.**
  - Every staff sidebar item lists the permissions that show it:

    | Item      | Shown with                                     |
    | --------- | ---------------------------------------------- |
    | Orders    | `billing.read`                                 |
    | Coupons   | `coupon.read`                                  |
    | Students  | `student.read`                                 |
    | Analytics | either analytics key                           |
    | Platform  | any `platform.*` key, or `discussion.moderate` |
    | Team      | `team.read` or `role.read`                     |

  - Filter the list with `useCapabilities()`.
  - Show the staff workspace when the user holds any staff permission.
  - Keep the skeleton until capabilities load, so items never appear and
    then vanish.
- **Routes and pages from permissions.**
  - Route guards use the same item → permission map. A blocked URL
    redirects to the first page the user can open.
  - Pages, tabs and action buttons use `can(...)` instead of the
    `isAdmin` / `isStaffRole` checks. For example, Refund needs
    `billing.manage`.

### 4.7 Rollout guard

Hide "New role" behind a `team_custom_roles` flag in the `features` table
until 4.5 and 4.6 are done. Until then, a custom-role member would get mixed
results from the API and an empty sidebar.

### 4.8 Later

- Roles limited to chosen courses: the DB already supports this.
- Temporary access, using `expires_at`.
- An audit log tab.

## 5. Open decisions

1. **Core or cloud.** Team management is assumed to live in core. Seat
   limits would go in cloud.
2. **Two-factor sign-in.** Should team members be required to use it?
3. **Invite expiry.** Is 7 days right?
4. **Learners on the team.** A team member can also be a learner (assumed
   yes).
5. **Instructor permissions.** Should instructors be able to create,
   publish and delete their own courses? This is the seed issue in
   section 3.
6. **Pre-approved expiry.** Should "add by email" rows expire, or wait
   forever (assumed: wait forever until cancelled)?
7. **Who sees Team.** Admin only by default, but the `team.*` / `role.*`
   keys can be given to others.
