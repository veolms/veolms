# Safari Responsive & UI Audit — ProCodrr web app

**Date:** 2026-10-24
**Browser under test:** Safari 27.0 on macOS 27 "Golden Gate" (BrowserStack Live, real VM), using Safari's Responsive Design Mode for viewport sizes
**Baseline for comparison:** Chrome 155 (headless, fresh guest profile) at the same viewport sizes
**Build under test:** production preview of `apps/web` (`pnpm preview:web`, port 4173) against the local API on port 4000. The dev server (port 3000) was too slow and unreliable through the BrowserStack tunnel. Details are under [How this was tested](#how-this-was-tested).
**Scope rule:** no code was modified. Every bug below was reproduced and measured; anything I could not confirm is listed under "Observations not counted" or "Could not test".

---

## Summary

The guest-facing layout is solid in Safari 27. On every guest page, at 375, 640, 641, 744, 1080, 1133 and 1366 px, Safari laid out the page identically to Chrome, element by element (positions and sizes within 12 px). Nothing overflowed horizontally, and nothing broke at the 640/641 or 1080/1081 breakpoints.

Signed in as a student, 38 routes (including all Settings tabs and all Discussions sub-tabs) were measured at 375, 744, 1080 and 1366 px; only SAF-010 turned up. Signed in as an admin, 21 pages were measured at 375, 744, 1080 and 1366 px. All of them fit at 1080 and 1366 px; two admin screens overflow at 375 and 744 px.

The real problems are in those two admin screens at phone and tablet widths, in the floating **mini video player**, and in a few smaller Safari-only and cross-browser issues.

**Added after the fixes:** lesson videos do not play in Safari ([SAF-011](#saf-011)). This was first written off as a test-setup limit, which was wrong. Tested later against the cloud web app, which includes the DRM plugin, every DRM step succeeds in Safari, but it never shows a frame.

| ID                  | Bug                                                                                                                                                   | Page / component                                         | Viewport                                         | Severity   | Safari-only?                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ---------- | ---------------------------------------------- |
| [SAF-001](#saf-001) | All three Analytics tabs (Overview, Revenue, Courses) are wider than the screen; the right-hand stat cards, charts and tables are cut off (58–294 px) | `/analytics`, `/analytics/revenue`, `/analytics/courses` | 375 and 744 px (fits at 1080, 1366)              | **High**   | Not compared ¹                                 |
| [SAF-002](#saf-002) | Home-page editor's lesson picker rows are 616 px wide inside a 306/558 px list; titles cut mid-word                                                   | `/platform/home` → hero lesson picker                    | 375 and 744 px (fits at 1080, 1366)              | **Medium** | Not compared ¹                                 |
| [SAF-003](#saf-003) | Mini player does not re-dock after the viewport is resized: floats mid-screen, or gets stuck shrunk in the top-left over the sidebar navigation       | Mini player (all pages after leaving a lesson)           | Any resize (window resize, rotation, split view) | **Medium** | No — Chrome identical                          |
| [SAF-004](#saf-004) | Mini player docked on the left covers the sidebar's profile/Login and appearance buttons                                                              | Mini player + sidebar                                    | ≥ 641 px (sidebar layouts)                       | **Medium** | No — Chrome identical                          |
| [SAF-005](#saf-005) | Escape closes the hidden mini player behind an open dialog instead of the dialog                                                                      | Login dialog (and any dialog) + mini player              | All                                              | Low        | No — Chrome identical                          |
| [SAF-006](#saf-006) | Unknown URLs show "Page not found" but the tab title is "Public profile · ProCodrr"                                                                   | Catch-all route                                          | All                                              | Low        | No — Chrome identical                          |
| [SAF-007](#saf-007) | Lesson list rows collapse to 0 px until rendered, so the list's scroll height jumps by ~22 % mid-scroll                                               | `/learn/*` course content panel                          | All (seen at 1133, 1366)                         | Low        | **Yes**                                        |
| [SAF-008](#saf-008) | Guest home "What Students Say" reviews show raw Markdown (`#`, `##`, `**`)                                                                            | `/` (guest home)                                         | All                                              | Low        | No — Chrome identical                          |
| [SAF-009](#saf-009) | Safari logs a console error on every page: viewport key `interactive-widget` not recognized                                                           | All pages (`<meta name="viewport">`)                     | All                                              | Low        | **Yes**                                        |
| [SAF-010](#saf-010) | Enrolled course cards cut their "Sections • Lectures • duration" line mid-word; the duration is hidden                                                | `/courses` (student, enrolled cards)                     | 744 px (fits at 375, 1080, 1366)                 | Low        | No — Chrome identical                          |
| [SAF-011](#saf-011) | Lesson video never starts: it buffers but no frame is ever shown, even though every DRM step succeeds                                                 | `/learn/*` lesson player and mini player                 | All                                              | **High**   | **Yes** (Chrome plays the same lesson)         |
| [SAF-012](#saf-012) | While the sidebar is being resized, its logo disappears at every width, even when wide open                                                           | Sidebar header, while dragging the sidebar's edge        | ≥ 641 px (sidebar layouts)                       | Medium     | **Yes** (Chrome fades the logo with the width) |

¹ Logged-in pages could only be checked in Safari; the Chrome baseline was a guest. Both causes are ordinary layout rules rather than Safari quirks, so Chrome is very likely affected too. Worth confirming when fixing.

Screenshots are in [`safari-audit-screenshots/`](safari-audit-screenshots/).

---

## Fix status

Fixes are on branch `fix/safari-responsive-audit` (from `dev` at `6a5bce49`). The findings below are left as they were recorded. Each fix was checked in Safari 27 on BrowserStack against a production preview of the fixed build. Chrome was checked for regressions against plain `dev`: 7 guest routes at 1366, 1080, 744 and 375 px, comparing the position and size of every element.

| ID      | Fix                                                                                                                                                                                             | Safari 27 result                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SAF-001 | The 8 stacking grids in the Overview, Revenue and Courses tabs get `grid-cols-1`, so their one column is the container's width instead of the widest table's.                                   | **Fixed.** At 375 and 744 px none of the three tabs is wider than the screen. Each table scrolls sideways in its own box inside the card, and the page itself does not scroll sideways. At 1366 px the `lg:` 2- and 5-column layouts are unchanged.                                                                                                                                                          |
| SAF-002 | The lesson picker list gets `grid-cols-1`, so a long title truncates in its row.                                                                                                                | **Fixed.** Rows are 303 px in the 305 px list at 375 px, and 556 px in 558 px at 744 px. Long titles end in an ellipsis inside their row.                                                                                                                                                                                                                                                                    |
| SAF-003 | The mini player remembers where it was put to rest (and whether against the right/bottom edges); a resize fits that place again instead of clamping wherever the last resize left it.           | **Fixed.** Docked right through 1080×744 → 744×1133 → 1366×900 → 1080×744, it stays 12 px from the bottom-right corner each time, at full size.                                                                                                                                                                                                                                                              |
| SAF-004 | The bottom-left dock starts past the sidebar, and a player docked there follows the sidebar when it widens or collapses (window resize or its toggle).                                          | **Fixed.** Docked left it sits 12 px past the sidebar: x 88 beside the collapsed sidebar (76 px), x 232 beside the expanded one (220 px), through resizes and both toggle directions.                                                                                                                                                                                                                        |
| SAF-005 | Escape leaves the mini player alone while a dialog (or modal drawer) is open.                                                                                                                   | **Fixed.** With the login dialog open, Escape closed only the dialog; the mini player stayed. With no dialog, Escape still closes the mini player.                                                                                                                                                                                                                                                           |
| SAF-006 | A profile address that finds nobody sets the not-found title.                                                                                                                                   | **Fixed.** `/this-page-does-not-exist` → tab title "Page not found · ProCodrr".                                                                                                                                                                                                                                                                                                                              |
| SAF-007 | `content-visibility` and its placeholder height move from the padded lesson list onto a plain block wrapped around it.                                                                          | **Fixed.** Course content scroll height on a fresh lesson page: 4510 → 4495 px (was 3736 → 4494, +20 %); TypeScript course 3937 → 3883 px. No 0 px rows.                                                                                                                                                                                                                                                     |
| SAF-008 | Reviews show the Markdown snippet as plain text (`markdownToPlainText`) when there is no title.                                                                                                 | **Fixed.** "What Students Say" shows no `#`, `##`, `**` or link syntax; the reviews read as plain sentences.                                                                                                                                                                                                                                                                                                 |
| SAF-009 | Not changed on purpose: `interactive-widget` is what keeps the layout right on Android when the keyboard opens. Safari only logs a message and ignores it.                                      | Unchanged (expected).                                                                                                                                                                                                                                                                                                                                                                                        |
| SAF-010 | The course card's meta line is a container: when it gets narrow, the second-last fact may shrink and truncate and the last one (with its bullet) drops, instead of the line being cut mid-word. | **Fixed (forced width).** With every meta line forced to the student cards' 149 px (also 120, 170, 190 px): "24 Sections • 678 Lectures" with the duration dropped; nothing cut, no line overflows. Full line from 208 px up. The 5 enrolled cards of the session checked (admin) are 221 px wide at 744 px, so they fit unforced at 375, 744, 1080 and 1366 px. Not re-checked on a student's 149 px cards. |
| SAF-011 | Not fixed. The cause is not pinned down yet (see the finding).                                                                                                                                  | Still fails: buffers 0–32 s, keys `usable`, no frame decoded.                                                                                                                                                                                                                                                                                                                                                |
| SAF-012 | The drag's width and logo opacity are also written on the elements that read them (`data-sidebar-resize-reader`: the sidebar, the logo, the toggle icon's bar), not only on the shell.          | **Fixed.** During a drag the logo fades with the width: 1 at 300 and 200 px, 0.597 at 150, 0.274 at 110, 1 again at 260 (before: 0 at every width). The same is true starting from the collapsed rail. Chrome is unchanged: same drag values, and every element in the same place on 7 pages at 4 widths.                                                                                                    |

**Chrome (Windows) regression check.**

- Home, courses, free courses, course overview, settings and 404: every element is in the same place and at the same size at all four widths.
- Lesson page: every visible text keeps the same position (180, 34, 43 and 48 text items at the four widths). The extra wrapper only changes the page structure under each section.
- Chrome's lesson-list estimate is now exact, so its small settle while scrolling went from −39 px to −15 px.
- The one intended visible change: a mini player docked right now re-docks to the bottom corner after the window grows taller (SAF-003). Before, it stayed 389 px higher.
- The remaining differences, a few pixels on the 404 illustration and the lesson placeholders, also appear between two runs of the same build: they come from image loading timing, not from the fixes.

---

## Findings

### SAF-001

**Analytics Overview overflows the screen at phone and tablet widths — High**

- **Page / component:** `/analytics`, Overview tab (`apps/web/src/analytics/tabs/OverviewTab.tsx`)
- **Viewport:** **375 × 667** (iPhone SE) and **744 × 1133** (iPad mini portrait). Fits at 1080 and 1366 px.
- **Safari-specific:** not compared (needs an admin login in Chrome).

**Steps to reproduce**

1. Sign in as an admin.
2. Set the viewport to 375 px or 744 px wide.
3. Open `/analytics` (Overview tab).

**Actual**

- **375 px:** the content column is **445 px wide inside a 346 px area** (main scroll area `scrollWidth 460` vs `clientWidth 376`). The right-hand stat cards (Orders, Total Students, Completion Rate) lose their right edge, and the "Performance Over Time", "Course Performance" and "Insights" sections are cut **84 px** past the visible edge.
- **744 px:** at this width the stat grid switches to three columns (`sm:grid-cols-3`), but each column is still 253.9 px, so it needs 786 px in a 631 px area (main `scrollWidth 811` vs `clientWidth 656`). The **entire third column** of stat cards (New Enrollments, Completion Rate) and the right side of every chart are cut **155 px** past the edge.

There's no way to scroll to the hidden part at either width.

**Revenue and Courses tabs (second admin pass):** the same overflow happens on the other two tabs, which use the same wrapper.

| Tab                  | 375 px                                          | 744 px (sidebar expanded)                                                                                                                            |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/analytics/revenue` | cut **58 px** (main `scrollWidth 433` vs `375`) | cut **294 px** (`806` vs `512`): Revenue by Product, Revenue Sources, Payment Methods, Commerce Funnel, Refund Trends, Top Revenue Courses, Insights |
| `/analytics/courses` | cut **79 px** (`454` vs `375`)                  | cut **226 px** (`738` vs `512`): stat cards, Enrollments Over Time, Top Courses, Content Insights, Lesson Mix, Quiz Results                          |

At 744 px the overflow is larger when the sidebar is expanded (main area 512 px) than when it's collapsed (656 px). Both tabs fit at 1080 and 1366 px.

**Expected:** all cards and charts fit within the screen: the stat grid shrinks to fit, and the table scrolls inside its own card.

**Evidence**

- Measured in Safari at 375 px: the wrapper `div.grid.gap-3.5.sm:gap-6` is 346 px wide, but its computed `grid-template-columns` is `444.8px`. The stat grid `section.grid.grid-cols-2` resolves to `217.4px 217.4px`.
- Widest children: `table.w-full` ("Course Performance") at 421 px, and the Recharts SVG at 421 px, which sizes itself from the already-widened column.
- At 744 px: `section.grid.grid-cols-2.sm:grid-cols-3` resolves to `253.9px 253.9px 253.9px` (786 px total).
- Screenshots: [`SAF-001-analytics-overflow-375.png`](safari-audit-screenshots/SAF-001-analytics-overflow-375.png), [`SAF-001-analytics-overflow-744.png`](safari-audit-screenshots/SAF-001-analytics-overflow-744.png), [`SAF-001-analytics-revenue-overflow-744.png`](safari-audit-screenshots/SAF-001-analytics-revenue-overflow-744.png)

**Likely source (pointer only):** `OverviewTab.tsx:229`, `<div className="grid gap-3.5 sm:gap-6">`. A grid with no column template gets one implicit `auto` column, and that column grows to its widest child's minimum width (here the Course Performance table) instead of the container width. `RevenueTab.tsx:387` and `CoursesTab.tsx:271` use the same wrapper and are worth checking at 375 px.

---

### SAF-002

**Home-page editor lesson picker rows overflow at phone width — Medium**

- **Page / component:** `/platform/home` (reached from `/home-page`), the "Playing … from …" hero lesson picker (`apps/web/src/home-page-settings/HeroLessonVideoPicker.tsx`)
- **Viewport:** 375 px and 744 px. Fits at 1080 and 1366 px.
- **Safari-specific:** not compared (admin only).

**Steps to reproduce**

1. Sign in as an admin, viewport 375 px or 744 px.
2. Open `/home-page` (redirects to `/platform/home`).
3. Look at the lesson list in the hero video picker.

**Actual:** each row is **616 px wide inside a 306 px list** at 375 px (`ul.grid.max-h-96`: `clientWidth 306`, `scrollWidth 618`; computed column `616px`). At 744 px it's still **618 px inside 558 px**. Lesson titles are clipped mid-word with no ellipsis, e.g. "How to Remember Everything We Learr…", "What is TypeScript & How does it Work" cut at the edge. The list scrolls sideways as well as down.

**Expected:** rows fit the list width and long titles wrap or end in "…", with only vertical scrolling.

**Evidence**

- Measured: 6 of 6 sampled rows are 616 px wide; text has `text-overflow: clip`.
- Screenshot: [`SAF-002-homepage-lesson-picker-375.png`](safari-audit-screenshots/SAF-002-homepage-lesson-picker-375.png)

**Likely source:** `HeroLessonVideoPicker.tsx:11`, `listClass = "grid max-h-96 gap-2 overflow-y-auto …"`. The implicit `auto` grid column takes the rows' unwrapped width. This is the same mechanism as SAF-001.

---

### SAF-003

**Mini player does not re-dock after a viewport resize — Medium (cross-browser)**

- **Page / component:** the floating mini player that appears after you leave a lesson (`apps/web/src/learning/player/useLearningMiniPlayerGestures.ts`)
- **Viewport:** any resize. Real-world triggers: resizing the Safari window, rotating an iPad, entering or leaving Split View or Stage Manager.
- **Safari-specific:** **no.** I replayed the exact resize sequences in Chrome and got identical coordinates.

**Steps to reproduce: (a) floats mid-screen**

1. Viewport 744 × 1133. Open a lesson (e.g. `/learn/the-complete-javascript-course`), then go to `/courses` so the mini player appears, docked bottom-right at x = 471.
2. Widen the viewport to 1133 × 744.

**Actual (a):** the mini player stays at **x = 471** (mid-screen), on top of the course grid, covering an "Enroll Now" button and card titles. Expected: re-docked to the right edge (x ≈ 861).

**Steps to reproduce: (b) stuck top-left**

1. With the mini player showing, make the viewport very narrow or short for a moment. This happens for real when a window is dragged small, and Safari's Responsive Design Mode always opens at 75 × 75.
2. Restore a normal desktop size (1280 × 800 or 1366 × 1024).

**Actual (b):** the mini player stays at **(12, 12), 200 × 164**, in the top-left corner, covering the ProCodrr logo and the Home/Courses navigation. It never returns to the bottom or to its normal desktop size (320 × 232). Expected: on resize it returns to its remembered corner at the size the new viewport allows.

**Evidence**

- Safari and Chrome both report `rect {x:12, y:12, w:200, h:164.5}` after sequence (b), and `x:471/472` after sequence (a).
- Screenshots: [`SAF-003-mini-player-mid-screen-1133.png`](safari-audit-screenshots/SAF-003-mini-player-mid-screen-1133.png), [`SAF-003-mini-player-stuck-top-left-1366.png`](safari-audit-screenshots/SAF-003-mini-player-stuck-top-left-1366.png)

**Likely source:** `useLearningMiniPlayerGestures.ts:557–571`. The resize handler calls `commitLayout(layoutRef.current)`, which only clamps the current absolute `left/top/width` into the new viewport (`clampLayout`, line 104). It never re-settles to the resting corner or side, so a clamp at a tiny size becomes permanent.

---

### SAF-004

**Left-docked mini player covers sidebar controls — Medium (cross-browser)**

- **Page / component:** mini player + sidebar profile/Login button and appearance dock
- **Viewport:** sidebar layouts, ≥ 641 px (seen at 1080 with the collapsed sidebar and at 1366 with the expanded one)
- **Safari-specific:** no (same coordinates in Chrome).

**Steps to reproduce**

1. Viewport 1366 × 1024. Leave a lesson so the mini player shows.
2. Dock the mini player on the left. A flick or drag to the left stores `sessionStorage['veolms-player-mini-side'] = "left"`.
3. Navigate to `/courses`.

**Actual:** the player sits at x 12–332, y ≈ 790–1011, directly over the sidebar's **Login / profile button** (centre 110, 916) and the **appearance, reading mode and settings buttons** (y ≈ 984). Those buttons can't be clicked until the player is closed or moved. At 1080 px (collapsed sidebar) it likewise covers the narrow sidebar's lower icons.

**Expected:** the left dock position starts to the right of the sidebar, or the player avoids the sidebar's controls.

**Evidence:** [`SAF-004-mini-player-covers-sidebar-1366.png`](safari-audit-screenshots/SAF-004-mini-player-covers-sidebar-1366.png)

---

### SAF-005

**Escape closes the background mini player instead of the open dialog — Low (cross-browser)**

- **Page / component:** login dialog (`AuthCardDialog`) and mini player keyboard shortcut (`apps/web/src/learning/player/useLearningPlayerMinimizeShortcut.ts`)
- **Viewport:** all (tested at 1366 × 1024)
- **Safari-specific:** no. Chrome, with a real key press via DevTools Protocol, behaves the same.

**Steps to reproduce**

1. Open a lesson, then go to a course overview so the mini player is showing.
2. Click **Pay Now** as a guest; the login dialog opens.
3. Click into the Email field and press **Escape** once.

**Actual:** the dialog **stays open** and the mini player behind it (not visible under the backdrop) **is closed**. A second Escape closes the dialog. Measured after the first Escape: `{ mini: false, dialog: true, active: "input email" }` in both browsers.

**Expected:** Escape closes the top-most layer (the dialog) and leaves the mini player alone.

**Evidence:** [`SAF-005-escape-closes-mini-player-not-dialog.png`](safari-audit-screenshots/SAF-005-escape-closes-mini-player-not-dialog.png) (dialog still open after the first Escape; mini player gone from bottom-left)

**Likely source:** `useLearningPlayerMinimizeShortcut.ts:20` and `:36`. Escape is handled by a `window` `keydown` listener in the **capture phase**, so it runs before the dialog's own Escape handling and regardless of focus.

---

### SAF-006

**Unknown URLs have the title "Public profile" — Low (cross-browser)**

- **Page / component:** catch-all routing; any unknown single-segment path such as `/this-page-does-not-exist`
- **Viewport:** all
- **Safari-specific:** no (same title in Chrome).

**Steps to reproduce:** open `/this-page-does-not-exist`.
**Actual:** the page shows "Page not found", but `document.title` (the tab/window title, bookmarks, history) is **"Public profile · ProCodrr"**. A "Public profile" skeleton also flashes before the not-found screen.
**Expected:** the title reads something like "Page not found · ProCodrr".

**Likely source:** single-segment unknown paths match `/:username`, whose route descriptor sets `title: "Public profile"` (`apps/web/src/routing/routeDescriptors.ts:230`). The title isn't updated when the profile turns out not to exist.

---

### SAF-007

**Lesson list rows collapse to 0 px in Safari until rendered — Low (Safari-only)**

- **Page / component:** course content list on lesson pages (`apps/web/src/learning/CurriculumLessonRows.tsx:164`, rows use `[content-visibility:auto] [contain-intrinsic-size:auto_86px]`)
- **Viewport:** wherever the list is visible; measured at 1133 × 744 and 1366 × 1024
- **Safari-specific:** **yes**

**Steps to reproduce**

1. In a fresh session, open a lesson in a course you haven't opened before (e.g. `/learn/complete-backend-with-nodejs`).
2. Scroll the course content list on the right slowly from top to bottom, watching the scrollbar.

**Actual (Safari):** rows that haven't been drawn yet measure **0 px** tall (9 rows in this course; 10 on the TypeScript course), ignoring the `contain-intrinsic-size` placeholder. The list's scroll height starts at **3458 px** and jumps to **4213 px (+755 px, +22 %)** once you scroll near those rows, so the scrollbar thumb shrinks and jumps mid-scroll. On the TypeScript course the second section measured 88 px in Safari vs 964 px in Chrome.

**Expected (and Chrome's behaviour):** unrendered rows reserve their 86 px placeholder; the scroll height stays stable (Chrome: 4248 → 4214 px, a 34 px settle).

**Evidence**

| Step (350 px each) | Safari scroll height | Safari 0-px rows | Chrome scroll height |
| ------------------ | -------------------- | ---------------- | -------------------- |
| 0–3                | 3458                 | 9                | 4248                 |
| 4                  | 4213                 | 0                | 4214                 |
| 5–10               | 4213                 | 0                | 4214                 |

Both browsers report the same computed styles (`content-visibility: auto`, `contain-intrinsic-size: auto 666px` on sections, `auto 86px` on rows). Screenshot of the list: [`SAF-007-curriculum-list-1133.png`](safari-audit-screenshots/SAF-007-curriculum-list-1133.png). The defect itself shows in the measurements, not in a single still image.

**Impact:** a jumping scrollbar and less predictable scroll positions on long courses (the Node.js course has 678 lessons). No overlapping or broken visuals were seen, because skipped rows aren't painted.

---

### SAF-008

**Guest home reviews show raw Markdown — Low (cross-browser)**

- **Page / component:** `/` as a guest, "What Students Say" section (`apps/web/src/home/guest/GuestHomeDiscussions.tsx:165–166`)
- **Viewport:** all (screenshot at 375 px)
- **Safari-specific:** no (same text in Chrome).

**Steps to reproduce:** sign out, open `/`, scroll to "What Students Say".
**Actual:** a review shows Markdown source as plain text: `# IPC (Inter-Process Communication) Notes ## What is IPC? **IPC (Inter-Process Communication)** is a fun…`.
**Expected:** the excerpt shows plain text without Markdown markers (or rendered Markdown).
**Evidence:** [`SAF-008-raw-markdown-review-375.png`](safari-audit-screenshots/SAF-008-raw-markdown-review-375.png)
**Likely source:** `{comment}` is rendered as-is inside a `line-clamp-6` span.

---

### SAF-009

**Safari console error from the viewport meta tag — Low (Safari-only)**

- **Page / component:** every page; `apps/web/src/root.tsx:249`
- **Viewport:** all
- **Safari-specific:** **yes**

**Steps to reproduce:** open any page in Safari with the Web Inspector console open.
**Actual:** `Viewport argument key "interactive-widget" not recognized and ignored.` is logged as an **error** on every page load (`content="…, interactive-widget=resizes-content"`).
**Expected:** no console errors. On iOS Safari the setting also has no effect, so the on-screen keyboard won't resize content the way it does in Chrome; this could not be tested here (see Could not test).
**Evidence:** [`SAF-009-console-interactive-widget.jpg`](safari-audit-screenshots/SAF-009-console-interactive-widget.jpg)

---

### SAF-010

**Enrolled course cards cut their meta line at tablet width — Low (cross-browser)**

- **Page / component:** `/courses` and its filters, signed in as a student; enrolled course cards with a progress bar (`apps/web/src/courses/CourseCard.tsx:462`)
- **Viewport:** 744 px. Fits at 375, 1080 and 1366 px.
- **Safari-specific:** no. Chrome (signed-in student, 744 px frame) overflows on the same 5 of 5 cards.

**Steps to reproduce**

1. Sign in as a student enrolled in a few courses.
2. Set the viewport to 744 px wide.
3. Open `/courses/enrolled`.

**Actual:** the line under each title ("24 Sections • 678 Lectures • 272h 14m") is cut off mid-word with no ellipsis, e.g. "24 Sections • 678 Lectu", "6 Sections • 96 Lecture". The duration is hidden completely. Measured in Safari: the row is 149 px wide but needs 170–193 px, on **all 5** enrolled cards.

**Expected:** the line fits, wraps, or ends in "…", and the duration stays visible or is dropped on purpose.

**Evidence**

- Safari: `p.mt-0.5.flex.min-w-0` has `clientWidth 149`, `scrollWidth 193` (Node.js card), with `overflow: hidden; white-space: nowrap`.
- Screenshot: [`SAF-010-course-card-meta-cut-744.png`](safari-audit-screenshots/SAF-010-course-card-meta-cut-744.png)

**Likely source:** `CourseCard.tsx:462`: `flex … overflow-hidden … whitespace-nowrap` with no truncation on the last items, so whatever doesn't fit is simply clipped.

---

### SAF-011

**Lesson videos never start in Safari — High (Safari-only)**

- **Page / component:** the lesson player and the mini player (`/learn/*`). ClearKey-protected HLS (fMP4) played through Shaka 5.2.7 with the cloud DRM plugin (`packages/plugin-drm/src/web`).
- **Viewport:** all.
- **Safari-specific:** **yes**. Chrome plays the same lesson from the same server (`readyState 4`, 640×360, keys attached).
- **Found:** after the fixes. The audit had written this off as a test-setup limit (see the corrected note under "Could not test").

**Steps to reproduce**

1. Run the cloud web app, which includes `plugin-drm`, and open it in Safari 27.
2. Open `/learn/the-ultimate-typescript-course`, lesson 1 (also playable as a guest).
3. Press play.

**Actual:** the player shows a buffering spinner at 0:00 indefinitely. There is no error screen and nothing in the console.

**Expected:** the lesson plays, as it does in Chrome.

**Evidence (Safari 27, measured in the page)**

| Step                                                                              | Result                                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `requestMediaKeySystemAccess("org.w3.clearkey")`, `cenc`, avc1.4d401e + mp4a.40.2 | granted                                                                                                                               |
| `createMediaKeys`, `createSession` ×2, `generateRequest("cenc")` ×2               | ok                                                                                                                                    |
| Licence `POST /v1/drm/clearkey/license?scope=media`                               | 200 in 30 ms                                                                                                                          |
| `session.update` ×2, then `keystatuseschange`                                     | ok; both keys `usable`                                                                                                                |
| `video.setMediaKeys`                                                              | ok. It happens **after** the sessions are set up, because the app preloads with Shaka's `player.preload()` (`shaka-early-preload.ts`) |
| Media data from the CDN                                                           | 0–32 s of the 103 s lesson buffered (video and audio segments)                                                                        |
| Playback                                                                          | `readyState 1`, `videoWidth 0`, `currentTime` stuck at 0.3 s: no frame is ever decoded                                                |

The init segment is plain `cenc` (`schm cenc`, `tenc` with an 8-byte IV, W3C common `pssh` `1077efec…`), which is what ClearKey expects. It is not `cbcs`.

**Likely source (not proven):** one of two things.

1. Safari's media pipeline does not decrypt ClearKey `cenc` samples, even though its key system grants access and reports the keys usable.
2. Safari does not apply keys that are attached to the video only after the sessions were created during preload.

To tell them apart: play the same lesson with Shaka's preload turned off (attach the video before loading). If it then plays, the order is the cause and the fix is in the player. If it still doesn't, Safari needs FairPlay (`com.apple.fps`). The DRM plugin's FairPlay driver (`fairplay.driver.ts`) is only a stub that answers `501 NOT_IMPLEMENTED`.

---

### SAF-012

**Sidebar logo disappears while the sidebar is resized — Medium (Safari-only)**

- **Page / component:** sidebar header on every page with the sidebar (`SidebarBrand.tsx`; the drag writes in `academyShellGeometry.ts`, `writeSidebarResizeWidth`).
- **Viewport:** sidebar layouts (≥ 641 px).
- **Safari-specific:** **yes**.
- **Found:** after the fixes. Reported from use, then reproduced.

**Steps to reproduce:** drag the sidebar's right edge, either narrower or wider.

**Actual (Safari, before the fix):** the logo is invisible for the whole drag and comes back on release. The shell held the right opacity (1 at 300 px), but the logo's value stayed 0.

**Expected (Chrome):** the logo fades with the width. It is fully shown from the narrowest expanded width up.

**Cause:** the drag writes `--sidebar-resize-logo-opacity` and `--sidebar-resize-preview-width` on the shell only. Both are registered as not inherited (`foundation.css`), and each element below takes them with `inherit`. Safari does not restyle such an element when the parent's value changes, so it keeps the value from before the drag.

The same applies to the toggle icon's bar, and to the floating sidebar's width while its edge is dragged.

---

## How this was tested

- **Safari:** Safari 27.0 (WebKit 605.1.15) on macOS 27 in a BrowserStack Live VM, reaching the app through BrowserStack Local at `http://bs-local.com:4173`. When signed in, Safari used `http://www.localhost.com:4173`.
- **Viewports:** Safari Responsive Design Mode presets and custom sizes.
  - Guest pages: **375×667, 640×744, 641×744, 744×1133, 1080×744, 1133×744, 1280×800, 1366×1024**.
  - Signed-in (admin) pages: **375×667, 744×1133, 1080×1080, 1366×1024**.
- **Measurements:** a small test script loaded into the page reported, for each page and size:
  - elements extending past the viewport;
  - content clipped by `overflow: hidden` containers;
  - unexpected horizontal scrollers;
  - clipped text, broken images, and console errors.

  It ran at the top and bottom of each page; the app scrolls inside `#courses-main-scrollport`, and the script scrolled that too.

- **Cross-browser comparison:** every guest page was captured in Safari and in headless Chrome at the same size with the same UI state (dark theme, same sidebar mode). Each element's position and size were then compared. Differences over 12 px were investigated; the only engine-level one was SAF-007.
- **Manual interaction in Safari (real mouse):**
  - phone lesson drawer: open, scroll-to-expand, Escape;
  - bottom-nav "You" sheet;
  - appearance popover and Light/Dark switch (View Transitions);
  - course-card ⋯ menu;
  - courses filter chips;
  - Pay Now → login dialog: focus, typing, Escape.
- **Data:** local database (courses such as `the-ultimate-typescript-course`, `complete-backend-with-nodejs`, `the-complete-javascript-course`).

### Coverage

| Page                                                                                                                                                                                                                                                                                                                                           | 375 | 640 | 641 | 744 | 1080 | 1133 | 1366 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | --- | --- | ---- | ---- | ---- |
| `/` (guest home)                                                                                                                                                                                                                                                                                                                               | ✓   | ✓   | ✓   | ✓   | ✓    | ✓    | ✓    |
| `/courses`, `/courses/free`, `/courses/not-enrolled`                                                                                                                                                                                                                                                                                           | ✓   | ✓   | ✓   | ✓   | ✓    | ✓    | ✓    |
| `/courses/:slug/overview` (2 courses)                                                                                                                                                                                                                                                                                                          | ✓   | ✓   | ✓   | ✓   | ✓    | ✓    | ✓    |
| `/learn/:slug` (2–3 courses)                                                                                                                                                                                                                                                                                                                   | ✓   | ✓   | ✓   | ✓   | ✓    | ✓    | ✓    |
| `/settings` (Appearance; Sidebar & Learning tabs at 1366)                                                                                                                                                                                                                                                                                      | ✓   | ✓   | ✓   | ✓   | ✓    | ✓    | ✓    |
| Login dialog (`/?login=1`, Pay Now)                                                                                                                                                                                                                                                                                                            | ✓   | –   | –   | ✓   | –    | ✓    | ✓    |
| 404 page                                                                                                                                                                                                                                                                                                                                       | ✓   | –   | –   | ✓   | –    | ✓    | ✓    |
| **Signed in as admin:** `/` dashboard, `/courses`, `/discussions`, `/orders`, `/students`, `/analytics`, `/coupons`, `/coupons/create`, `/courses/create`, `/quizzes`, `/quizzes/create`, `/platform`, `/platform/home`, `/notifications`, `/progress`, `/wishlist` (redirects to `/courses` for admins), `/team`, `/settings`, `/learn/:slug` | ✓   | –   | –   | ✓   | ✓    | –    | ✓    |

| **Signed in as student (38 routes):** `/`, `/home`, `/courses` + enrolled / not-enrolled / free / wishlist, `/wishlist`, `/discussions` + all 7 sub-tabs, `/progress`, `/progress/:username`, `/orders`, `/purchase-history`, `/notifications`, `/messages`, `/reviews`, `/quizzes`, `/team`, all 7 `/settings/*` tabs, `/:username` (own public profile), `/invite/:token` (invalid token), a course overview, 2 lesson pages, the legacy `/courses/:slug/:lecture` address | ✓ | – | – | ✓ | ✓ | – | ✓ |

| **Signed in as admin, second pass (25 routes):** `/analytics/revenue`, `/analytics/courses`, all 6 course-editor steps for a new course (`/courses/create/<step>`) and an existing one (`/courses/:id/edit/<step>`: basics, curriculum, access-rules, pricing, extras, publish), all 5 `/platform/*` tabs (home, appearance, security, general, invoice), `/students/:username`, `/coupons/:id`, `/quizzes/:id`, `/team/members`, `/team/roles`, `/team/invitations` | ✓ | – | – | ✓ | ✓ | – | ✓ |

Signed-in pages were measured in Safari only, at 375, 744, 1080 and 1366 px, across four Safari sessions. In the second admin pass, apart from the Analytics tabs (SAF-001) and the lesson picker on `/platform/home` (SAF-002), every route measured clean at every width. The editors and detail pages were only opened and measured: nothing was saved, published or deleted. For the student pass, Responsive Design Mode wouldn't open in that session, so each viewport was a fixed-size same-origin iframe inside Safari (the page reports the exact width, e.g. 375 px with the compact phone layout). Apart from SAF-001 and SAF-002 (at 375 and 744 px), every signed-in page measured clean at every width: no page-level overflow and no content cut off. Tab rows, chip rows and the Orders/Students tables scroll sideways inside their own containers by design.

---

## Observations not counted as bugs

These were looked at and deliberately left out, so nobody chases them:

| Observation                                                                                                                                                   | Why it's not counted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson video shows "Something went wrong" on the audit's preview build (`Shaka Error 6012`, ClearKey)                                                         | **Corrected:** not a Safari issue. 6012 is `NO_LICENSE_SERVER_GIVEN`. The preview was the core web app without the cloud DRM plugin, so it had no licence address, and Chrome fails the same way on that build. The "not a secure context" explanation given earlier was wrong: Safari grants ClearKey on `http://bs-local.com`. On the cloud web app the video fails differently, see [SAF-011](#saf-011) ([`NT-video-something-went-wrong-1133.png`](safari-audit-screenshots/NT-video-something-went-wrong-1133.png)). |
| React hydration-mismatch warning for two inline `<head>` scripts                                                                                              | Dev server only; Chrome logs the same warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| "Resource was preloaded but not used" warnings                                                                                                                | Same in Chrome; caused by the slow test tunnel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ResizeObserver loop completed with undelivered notifications`                                                                                                | Benign; also in Chrome.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Google sign-in errors (`origin is not allowed for the given client ID`)                                                                                       | The BrowserStack test origin isn't registered with Google.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Mini player once found docked left in Safari                                                                                                                  | Not reproducible; the side is set by flick gestures and may have come from a scroll-wheel event over it.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Login dialog's Close button matches `:focus-visible` in Safari                                                                                                | No ring is actually drawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Search shortcut badge narrower in Safari (⌘K vs Ctrl K)                                                                                                       | Platform difference by design.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/orders` once had the title "Discussions"                                                                                                                    | Only on its first, still-loading visit; correct on 3 re-tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/settings`, `/platform` and `/analytics` swipeable tab panel 4–6 px wider than the main area (375, 1080, 1366 px)                                            | Measured but not visible on screen; worth a look while fixing SAF-001/002.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Lesson page course content panel lies outside the main area's box at 1366 px; Orders/Discussions side panels sit just off-screen with a visible resize handle | Layout by design: the panel is visible, and the side panels are closed drawers.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Minified React error #418` (hydration text mismatch) in Safari's console                                                                                     | Seen only once, on a malformed URL (`//login=1`) typed through the remote keyboard; not seen on normal pages.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Admin's collapsed sidebar hides the profile name and role (744 px)                                                                                            | Intended collapsed-sidebar behaviour (avatar only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Discussions search placeholder cut by the ⌘K badge at 375                                                                                                     | Normal placeholder truncation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Guest "You" sheet has a large empty area                                                                                                                      | Same in Chrome; design choice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/messages`, `/reviews` show "Page not found" (admin and student)                                                                                             | Intentional: both are mapped to the not-found page in `apps/web/src/routing/routeDescriptors.ts` (reviews has no backend yet, per the comment at line 233).                                                                                                                                                                                                                                                                                                                                                               |
| `/invite/<invalid token>` shows "Page not found"                                                                                                              | Expected for a bad token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Course editor Publish step and quiz editor: select box text wider than the box (375 px)                                                                       | The text ends in "…" (`text-overflow: ellipsis`), as designed.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Course editor bottom button bar 8 px wider than its column (375 px)                                                                                           | Deliberately full-bleed (0–375 px); its buttons sit inside the screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## Could not test

- **Signed-in pages at 640, 641 and 1133 px.** Signed-in pages were run at 375, 744, 1080 and 1366 px only; the boundary widths were covered for guest pages.
- **Cross-browser comparison for signed-in pages.** The Chrome baseline was a guest. I didn't copy login codes or session tokens into it.
- **Lesson video playback (corrected; now tested, see [SAF-011](#saf-011)).**
  - **Earlier note was wrong:** it blamed the insecure test origin. In fact the audit's preview build had no DRM plugin, so no browser could play it there.
  - **Retest:** against the cloud web app (the local dev server on port 3000, reached through a small local proxy that rewrites the `Host` header, because Vite only accepts `localhost`), every DRM step succeeds in Safari but no frame is shown.
  - **Still worth checking:** an HTTPS staging site, to confirm the same behaviour outside a dev server.
- **Clipboard (Copy Course Link) and Web Share:** `navigator.clipboard` doesn't exist on insecure origins.
- **Google sign-in / One Tap:** origin not allowed for the client ID.
- **iOS / iPadOS Safari on real devices:** Responsive Design Mode on macOS doesn't reproduce touch input, the collapsing toolbar (`100vh`/`dvh` differences), the on-screen keyboard (`interactive-widget`), safe areas or home-indicator spacing.
- **Gestures:** mini player drag, flick and pinch; sidebar resize handle; horizontal trackpad scrolling of chip rows. The remote session didn't pass horizontal scroll or drag precisely.
- **Keyboard-only navigation:** the remote keyboard dropped the Shift key, so Shift+Tab, shortcuts and Safari's "Press Tab to highlight each item" behaviour weren't covered.
- **Quiz attempt page** (`/quizzes/attempt/:id`): opening it starts a real attempt for the signed-in student, so it was skipped on purpose. `/logout` was skipped too.
- **Flows beyond page load** (no forms submitted, nothing created, edited or deleted, no payments, no posts in discussions).
- **Dev server build (port 3000):** the audit used the production preview build.
- **Other Safari versions** (16–18), and reading mode / light theme beyond a spot check.
