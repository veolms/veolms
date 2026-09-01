# 🎓 VeoLMS — `apps/web` Frontend Application

> **Location:** `d:\veo-lms\veolms\apps\web`  
> **Monorepo:** Turborepo v2 + pnpm v11 · **Node:** ≥24 · **TypeScript:** 7.x  
> **Framework:** React Router v8 (Framework Mode) · **Backend:** Fastify v5 · **DB:** PostgreSQL + Kysely

---

## 📚 Table of Contents

1. [What Already Exists](#-what-already-exists)
2. [Confirmed Tech Stack](#-confirmed-tech-stack)
3. [Full Folder Structure (Extended)](#-full-folder-structure-extended)
4. [Folder & File Explanations — Layer by Layer](#-folder--file-explanations--layer-by-layer)
5. [Key Patterns & Conventions](#-key-patterns--conventions)

---

## ✅ What Already Exists

> These files/folders are **already in place** — do not break them. The folder structure below **extends** them.

```
apps/web/
├── app/
│   ├── app.css                     ✅ CSS variable tokens + Tailwind + component classes
│   ├── root.tsx                    ✅ Root layout: <html>, <Header>, <Outlet>, ErrorBoundary
│   ├── routes.ts                   ✅ Route manifest (5 routes defined)
│   ├── config/
│   │   └── academy.ts              ✅ Brand name, headlines, pageTitle() helper
│   ├── lib/
│   │   └── api.ts                  ✅ getCourses(), getCourse() — fetch + Zod parse via @veolms/contracts
│   ├── components/
│   │   ├── header.tsx              ✅ Site header with NavLink + brand logo
│   │   └── course-card.tsx         ✅ Course card component
│   └── routes/
│       ├── home.tsx                ✅ / — loader + clientLoader + hero + course grid
│       ├── courses.tsx             ✅ /courses — course catalog
│       ├── course-detail.tsx       ✅ /courses/:slug — course detail page
│       ├── login.tsx               ✅ /login — login form
│       └── register.tsx            ✅ /register — registration form
├── react-router.config.ts          ✅ ssr:false, prerender() fetches /courses slugs dynamically
├── vite.config.ts                  ✅ tailwindcss() + reactRouter(), proxy /api, WEB_PORT
├── tsconfig.json                   ✅
└── package.json                    ✅ @veolms/web — RR8, Tailwind v4, React 19, @veolms/contracts
```

**Shared packages already wired in:**

- `@veolms/contracts` — Zod schemas + TypeScript interfaces (`CourseSummary`, `PublicCourse`, etc.)
- `@veolms/config` — `loadWebConfig()` — reads env vars with type safety
- `@veolms/database` — Kysely client + schema (used by API, not web)

---

## 🧰 Confirmed Tech Stack

### Core — Already Installed

| Tool             | Version  | Notes                                                     |
| ---------------- | -------- | --------------------------------------------------------- |
| **React**        | 19.x     | Concurrent features, `use()` hook                         |
| **React Router** | **v8.x** | Framework Mode — `ssr:false`, prerender, loaders, actions |
| **TypeScript**   | **7.x**  | Native TS compiler (`@typescript/native`)                 |
| **Tailwind CSS** | v4.x     | `@tailwindcss/vite` plugin, CSS-first config              |
| **Vite**         | v8.x     | Ultra-fast HMR, built into RR8 dev server                 |
| **pnpm**         | v11.x    | Workspace package manager                                 |
| **Turborepo**    | v2.x     | Task pipeline: build, dev, typecheck                      |

---

### 🧠 State Management — Split Model (To Add)

> **Rule:** Never mix state types. Each tool handles only what it's designed for.

| State Type             | Tool                               | Reason                                             |
| ---------------------- | ---------------------------------- | -------------------------------------------------- |
| **Server / async**     | **TanStack Query v5**              | Caching, background refetch, pagination, mutations |
| **Global client UI**   | **Zustand v5**                     | Auth user, theme mode, sidebar, player, cart       |
| **Form state**         | **React Hook Form v7**             | Uncontrolled — zero re-renders on keystroke        |
| **URL / filter state** | **React Router `useSearchParams`** | Shareable, bookmarkable, browser-native            |
| **Local UI state**     | `useState` / `useReducer`          | Modals, toggles, accordions — never global         |

**Why NOT Redux?** — Massive boilerplate for LMS. RTK Query duplicates TanStack Query.  
**Why NOT Context alone?** — Re-renders entire tree. Fatal for dashboards with many widgets.  
**Why NOT Jotai?** — Great library but atom model adds complexity for team onboarding.

---

### 🎨 CSS & Design System (Build on Existing)

The project already has a **CSS variable token system** in `app/app.css` (dark mode, purple accent `#8b5cf6`). Extend it — don't replace it. Ship dark/light first; extra color themes can wait until branding needs are real.

| Tool                               | Role                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| **Tailwind CSS v4**                | Already installed. Utility-first layout, spacing, responsive             |
| **CSS Variables**                  | Already in `app.css`. Extend with theme tokens for multi-theme           |
| **Radix UI**                       | Accessible headless primitives installed as `@radix-ui/react-*` packages |
| **class-variance-authority (cva)** | Type-safe component variant API                                          |
| **clsx + tailwind-merge**          | Safe conditional classname merging                                       |
| **Framer Motion v12**              | Page transitions, micro-animations                                       |
| **@tailwindcss/typography**        | Prose styling for Tiptap rich text output                                |

**Existing CSS classes to keep and build on:**

```css
/* Already in app/app.css — keep all of these */
.page-shell      → max-width container centered
.eyebrow         → purple accent label text
.primary-link    → filled purple button/link
.text-link       → underline link
.nav-link        → muted nav item
.course-grid     → responsive 3-col grid
.form-page       → centered form page layout
.form-card       → surface card for auth forms
.field-label     → form label
.field-input     → form input base
.site-header     → sticky header
.surface-section → surface-colored section
.course-card     → course card shell
.heading         → primary text heading
.muted           → muted text
```

**Theme extension (add to `app/app.css`):**

```css
/* Later, only when needed: */
:root[data-theme="green"]  { --color-accent: hsl(142 71% 45%); ... }
:root[data-theme="blue"]   { --color-accent: hsl(217 91% 60%); ... }
:root[data-mode="light"]   { color-scheme: light; --color-background: #ffffff; ... }
/* etc. Zustand theme.store writes data-theme + data-mode to <html> */
```

---

### 📝 Forms

| Tool                    | Version | Role                                                         |
| ----------------------- | ------- | ------------------------------------------------------------ |
| **React Hook Form**     | v7.x    | Uncontrolled forms, zero re-renders                          |
| **Zod**                 | v3.x    | Validation schemas — **already used in `@veolms/contracts`** |
| **@hookform/resolvers** | v4.x    | Connects Zod to RHF                                          |

**Power move:** Extend `@veolms/contracts` with form schemas (not just API response schemas). Then RHF + Fastify share the same Zod schema — change once, both sides validate.

---

### 📖 Rich Text Editor

| Tool                | Verdict         | Reason                                                         |
| ------------------- | --------------- | -------------------------------------------------------------- |
| **Tiptap v2**       | ✅ **Use this** | Headless, Tailwind-styled, ProseMirror-based, TypeScript-first |
| Quill / react-quill | ❌ Avoid        | Abandoned since 2019, CSS conflicts, SSR broken                |
| Lexical (Meta)      | ⚠️ Complex      | Very low-level, requires building everything                   |
| CKEditor 5          | ❌ Avoid        | License issues, heavy, opinionated CSS                         |

Tiptap is what **Notion, Linear, GitLab** use. It's headless — no default CSS, you style 100% with Tailwind.  
Used for: course description, lesson content, quiz instructions, announcements.

---

### 🎥 Video Player

| Tool            | Verdict                                                            | Reason |
| --------------- | ------------------------------------------------------------------ | ------ |
| **Vidstack v2** | ✅ React-first, HLS built-in, fully accessible, Tailwind-styleable |
| raw hls.js      | ⚠️ You build the entire UI yourself                                |
| Plyr            | ⚠️ React wrapper is unofficial                                     |

---

### 📡 Data Fetching

**Existing pattern** (`app/lib/api.ts`): Plain `fetch()` + Zod parse from `@veolms/contracts` for current public prerendered course pages. Keep this small.  
**Extended pattern**: Put resource API calls in feature services, then wrap them with colocated TanStack Query hooks.

```
Public prerendered pages → RR8 loader() → plain fetch → Zod parse (existing pattern ✅)
Private authenticated    → TanStack Query clientLoader → fetch with auth header
Mutations (forms)        → RR8 action() OR useMutation() from TanStack Query
Real-time updates        → Socket.IO Client (notifications, video processing status)
```

---

### 🗄️ ORM — Kysely (Already Decided)

The monorepo uses **Kysely** in `packages/database` — not Drizzle, not Prisma. This is a backend concern. The web app never touches Kysely — it only talks to the Fastify API via fetch.

---

### 🧪 Testing

| Layer     | Tool                       | Scope                                               |
| --------- | -------------------------- | --------------------------------------------------- |
| Unit      | **Vitest**                 | Utility functions, Zod schemas, Zustand store logic |
| Component | **@testing-library/react** | Rendering, interactions, a11y                       |
| E2E       | **Playwright**             | Full flows: enroll → watch → quiz → certificate     |
| API mock  | **MSW v2**                 | Mock Fastify during unit/component tests            |

---

### 📦 Other Libraries

| Library                     | Role                                                 |
| --------------------------- | ---------------------------------------------------- |
| **Zustand v5**              | Global client state (auth, theme, player, UI)        |
| **TanStack Query v5**       | Server state, caching, mutations                     |
| **TanStack Table v8**       | Headless data tables (admin panels)                  |
| **TanStack Virtual**        | Virtualized lesson lists and very large admin tables |
| **Recharts**                | Analytics charts (enrollment, revenue)               |
| **Sonner**                  | Toast notifications                                  |
| **Lucide React**            | Icon library (tree-shakeable)                        |
| **date-fns v4**             | Date formatting/manipulation                         |
| **jsPDF + jspdf-autotable** | Certificate PDF export                               |
| **xlsx + papaparse**        | Excel/CSV admin import-export                        |
| **cmdk**                    | Command palette (⌘K search)                          |
| **Socket.IO Client**        | Real-time notifications + video job progress         |
| **vite-plugin-pwa**         | PWA — offline support, install prompt                |
| **web-vitals**              | LCP, INP, CLS measurement and reporting              |
| **Framer Motion v12**       | Animations, page transitions                         |

---

## 📁 Full Folder Structure (Extended)

> **Legend:**  
> `✅ EXISTS` — already in repo, do not delete or break  
> `➕ ADD` — new file/folder to create  
> `~` — extends existing content

```
apps/web/
│
├── app/                                           ← React Router v8 Framework Mode root
│   │
│   ├── app.css                     ✅ EXISTS      ← Global CSS: Tailwind import, tokens, component classes
│   │                                              ~ ADD: multi-theme CSS variables, animation keyframes
│   │
│   ├── root.tsx                    ✅ EXISTS      ← Root layout: <html>, <Header>, <Outlet>, ErrorBoundary
│   │                                              ~ ADD: wrap with <AppProviders>, add <Toaster>
│   │
│   ├── routes.ts                   ✅ EXISTS      ← Route manifest (5 routes today)
│   │                                              ~ ADD: all auth, dashboard, admin, checkout routes
│   │
│   ├── config/                     ✅ EXISTS
│   │   ├── academy.ts              ✅ EXISTS      ← Brand name, headlines, pageTitle() — keep as-is
│   │   ├── app.config.ts           ➕ ADD         ← Pagination limits, upload limits, app constants
│   │   └── features.ts             ➕ ADD         ← Feature flags: certificates, wishlist, discussion, coupons, AI
│   │
│   ├── lib/                        ✅ EXISTS
│   │   ├── api.ts                  ✅ EXISTS      ← Current public course fetches; keep small, do not grow into second service layer
│   │   ├── fetch-client.ts         ➕ ADD         ← Base fetch wrapper: auth header, 401 refresh, error throw
│   │   ├── query-client.ts         ➕ ADD         ← TanStack QueryClient singleton: staleTime, retry config
│   │   ├── socket.ts               ➕ ADD         ← Socket.IO client singleton (connect on auth)
│   │   ├── tiptap.ts               ➕ ADD         ← Pre-built Tiptap extension bundle (StarterKit + extras)
│   │   └── utils.ts                ➕ ADD         ← cn() = clsx + tailwind-merge, formatters
│   │
│   ├── components/                 ✅ EXISTS
│   │   ├── header.tsx              ✅ EXISTS      ← Public site header — keep, will extend for auth state
│   │   ├── course-card.tsx         ✅ EXISTS      ← Course card — keep, extend with progress bar variant
│   │   │
│   │   ├── ui/                     ➕ ADD         ← SMALL PRIMITIVES — app-owned wrappers only when branding/variants help
│   │   │   ├── accordion.tsx       ➕ ADD         ← Collapsible content (curriculum sections)
│   │   │   ├── alert.tsx           ➕ ADD         ← Inline alert banners (error, warning, success, info)
│   │   │   ├── alert-dialog.tsx    ➕ ADD         ← Confirmation modal ("Are you sure you want to delete?")
│   │   │   ├── avatar.tsx          ➕ ADD         ← User avatar with fallback initials
│   │   │   ├── badge.tsx           ➕ ADD         ← Status/tag pills (Published, Draft, Free, etc.)
│   │   │   ├── breadcrumb.tsx      ➕ ADD         ← Breadcrumb navigation
│   │   │   ├── button.tsx          ➕ ADD         ← Button with cva variants (primary, secondary, ghost, danger)
│   │   │   ├── calendar.tsx        ➕ ADD         ← Date picker calendar (for coupon expiry, scheduling)
│   │   │   ├── card.tsx            ➕ ADD         ← Card shell with header, content, footer slots
│   │   │   ├── checkbox.tsx        ➕ ADD         ← Accessible checkbox (quiz options, bulk select)
│   │   │   ├── collapsible.tsx     ➕ ADD         ← Controlled show/hide section
│   │   │   ├── command.tsx         ➕ ADD         ← cmdk wrapper — command palette base component
│   │   │   ├── data-table.tsx      ➕ ADD         ← TanStack Table v8 wrapper (sort, filter, paginate)
│   │   │   ├── date-picker.tsx     ➕ ADD         ← Calendar + Popover combo for date inputs
│   │   │   ├── dialog.tsx          ➕ ADD         ← Modal dialog (Radix Dialog primitive)
│   │   │   ├── drawer.tsx          ➕ ADD         ← Mobile-friendly bottom sheet / side drawer
│   │   │   ├── dropdown-menu.tsx   ➕ ADD         ← Dropdown with items, icons, keyboard nav
│   │   │   ├── empty-state.tsx     ➕ ADD         ← Empty state with illustration + CTA
│   │   │   ├── form.tsx            ➕ ADD         ← RHF helpers + Radix Label-based field primitives (label, error, desc)
│   │   │   ├── input.tsx           ➕ ADD         ← Base input with variant support
│   │   │   ├── label.tsx           ➕ ADD         ← Accessible form label
│   │   │   ├── pagination.tsx      ➕ ADD         ← Page navigation for tables and course lists
│   │   │   ├── popover.tsx         ➕ ADD         ← Popover anchor + content (date picker, color picker)
│   │   │   ├── progress.tsx        ➕ ADD         ← Progress bar (course completion %, upload %)
│   │   │   ├── radio-group.tsx     ➕ ADD         ← Radio buttons (quiz MCQ, filter options)
│   │   │   ├── scroll-area.tsx     ➕ ADD         ← Custom scrollbar (lesson sidebar, log panels)
│   │   │   ├── select.tsx          ➕ ADD         ← Dropdown select (category, level, language)
│   │   │   ├── separator.tsx       ➕ ADD         ← Horizontal/vertical divider line
│   │   │   ├── sheet.tsx           ➕ ADD         ← Slide-over panel from edge (mobile menu, details)
│   │   │   ├── skeleton.tsx        ➕ ADD         ← Skeleton loader block
│   │   │   ├── slider.tsx          ➕ ADD         ← Range slider (video seek, volume)
│   │   │   ├── spinner.tsx         ➕ ADD         ← Loading spinner (button states, lazy routes)
│   │   │   ├── switch.tsx          ➕ ADD         ← Toggle switch (course published, feature toggles)
│   │   │   ├── table.tsx           ➕ ADD         ← HTML table primitives (thead, tbody, td, tr)
│   │   │   ├── tabs.tsx            ➕ ADD         ← Tab navigation (course editor sections)
│   │   │   ├── textarea.tsx        ➕ ADD         ← Multiline text input
│   │   │   ├── toast.tsx           ➕ ADD         ← Sonner toast wrapper + theme integration
│   │   │   ├── toaster.tsx         ➕ ADD         ← <Toaster> with CSS variable colors
│   │   │   ├── toggle.tsx          ➕ ADD         ← Toggle button (Tiptap toolbar bold/italic/etc.)
│   │   │   └── tooltip.tsx         ➕ ADD         ← Hover tooltip (keyboard shortcuts, icon labels)
│   │   │
│   │   ├── layout/                 ➕ ADD         ← PAGE LAYOUT SHELLS
│   │   │   ├── public-layout.tsx   ➕ ADD         ← Header + <Outlet> + Footer for public pages
│   │   │   ├── auth-layout.tsx     ➕ ADD         ← Centered card for login/register (extends existing form-page CSS)
│   │   │   ├── dashboard-layout.tsx ➕ ADD        ← Sidebar + top bar + <Outlet> (student)
│   │   │   ├── admin-layout.tsx    ➕ ADD         ← Sidebar + top bar + <Outlet> (admin — role guard)
│   │   │   ├── sidebar/
│   │   │   │   ├── sidebar.tsx     ➕ ADD         ← Sidebar shell: logo, nav, collapse button
│   │   │   │   ├── sidebar-item.tsx ➕ ADD        ← Single nav link with icon + active state
│   │   │   │   ├── student-nav.tsx  ➕ ADD        ← Student sidebar link list
│   │   │   │   └── admin-nav.tsx    ➕ ADD        ← Admin sidebar link list
│   │   │   └── footer/
│   │   │       ├── footer.tsx      ➕ ADD         ← Site footer with links + brand
│   │   │       └── footer-links.tsx ➕ ADD        ← Footer link groups (company, support, legal)
│   │   │
│   │   ├── common/                 ➕ ADD         ← SHARED across features, not domain-specific
│   │   │   ├── command-palette.tsx ➕ ADD         ← ⌘K global search (cmdk + all routes)
│   │   │   ├── confirm-dialog.tsx  ➕ ADD         ← Reusable "Are you sure?" pattern
│   │   │   ├── error-boundary.tsx  ➕ ADD         ← Per-route React ErrorBoundary
│   │   │   ├── not-found.tsx       ➕ ADD         ← 404 component (used in root.tsx ErrorBoundary)
│   │   │   ├── notification-bell.tsx ➕ ADD       ← Bell icon + popover list (Socket.IO driven)
│   │   │   ├── page-header.tsx     ➕ ADD         ← Page title + breadcrumb + action buttons row
│   │   │   ├── protected-route.tsx ➕ ADD         ← Thin route guard; calls app/permissions guards
│   │   │   ├── pwa-update-prompt.tsx ➕ ADD       ← "Update available" banner (vite-plugin-pwa)
│   │   │   ├── seo.tsx             ➕ ADD         ← <title> + <meta> helper (wraps RR8 meta export)
│   │   │   └── theme-switcher.tsx  ➕ ADD         ← Theme color + light/dark mode picker
│   │   │
│   │   ├── course/                 ➕ ADD         ← PUBLIC COURSE BROWSING COMPONENTS
│   │   │   ├── course-card.tsx     ✅ EXISTS      ← Keep existing, may extend with progress variant
│   │   │   ├── course-card-skeleton.tsx ➕ ADD    ← Skeleton version for loading state
│   │   │   ├── course-grid.tsx     ➕ ADD         ← Responsive grid (uses existing .course-grid CSS)
│   │   │   ├── course-filters.tsx  ➕ ADD         ← Category, level, price, search filters
│   │   │   ├── course-search.tsx   ➕ ADD         ← Debounced search input
│   │   │   ├── course-hero.tsx     ➕ ADD         ← Detail page hero: title, rating, instructor, meta
│   │   │   ├── course-curriculum.tsx ➕ ADD       ← Accordion: sections → lessons (public preview)
│   │   │   ├── course-instructor.tsx ➕ ADD       ← Instructor bio card
│   │   │   ├── course-reviews.tsx  ➕ ADD         ← Reviews list with star ratings
│   │   │   ├── course-review-form.tsx ➕ ADD      ← Submit review (RHF + Zod)
│   │   │   ├── course-requirements.tsx ➕ ADD     ← Prerequisites list
│   │   │   ├── course-objectives.tsx ➕ ADD       ← What you'll learn list
│   │   │   ├── course-enroll-cta.tsx ➕ ADD       ← Sticky price card + enroll/buy button
│   │   │   └── hooks/              ➕ ADD         ← use-courses, use-course, use-course-mutations
│   │   │
│   │   ├── learn/                  ➕ ADD         ← IN-COURSE LEARNING EXPERIENCE
│   │   │   ├── learn-layout.tsx    ➕ ADD         ← Full-screen: player left, sidebar right
│   │   │   ├── lesson-sidebar.tsx  ➕ ADD         ← Curriculum tree with completion checkmarks
│   │   │   ├── lesson-sidebar-section.tsx ➕ ADD  ← Collapsible section row
│   │   │   ├── lesson-sidebar-item.tsx ➕ ADD     ← Single lesson link (video/article/quiz icon)
│   │   │   ├── lesson-complete-btn.tsx ➕ ADD     ← "Mark complete" → "Next lesson →" button
│   │   │   ├── lesson-notes.tsx    ➕ ADD         ← Timestamped student notes panel
│   │   │   ├── lesson-note-card.tsx ➕ ADD        ← Single note with timestamp + edit/delete
│   │   │   ├── lesson-resources.tsx ➕ ADD        ← Downloadable lesson attachments
│   │   │   ├── lesson-discussion.tsx ➕ ADD       ← Q&A thread for lesson
│   │   │   ├── lesson-discussion-item.tsx ➕ ADD  ← Single Q&A comment
│   │   │   ├── course-progress-bar.tsx ➕ ADD     ← Thin top bar: "X% complete"
│   │   │   └── hooks/              ➕ ADD         ← use-progress, use-notes, use-discussion
│   │   │
│   │   ├── player/                 ➕ ADD         ← VIDEO PLAYER
│   │   │   ├── video-player.tsx    ➕ ADD         ← Vidstack v2 wrapper with HLS.js
│   │   │   ├── player-controls.tsx ➕ ADD         ← Custom play/pause/seek/volume (Tailwind-styled)
│   │   │   ├── player-quality.tsx  ➕ ADD         ← 360p / 720p / 1080p dropdown
│   │   │   ├── player-speed.tsx    ➕ ADD         ← 0.5× → 2× playback speed selector
│   │   │   ├── player-subtitles.tsx ➕ ADD        ← CC toggle + track selector
│   │   │   ├── player-timeline.tsx ➕ ADD         ← Timeline, chapters, thumbnail preview
│   │   │   ├── player-shortcuts.tsx ➕ ADD        ← Keyboard shortcut registration
│   │   │   ├── transcript-panel.tsx ➕ ADD        ← Searchable transcript and timestamp navigation
│   │   │   ├── player-tracker.tsx  ➕ ADD         ← Thin bridge to use-video-progress; tracking logic stays in hook
│   │   │   ├── video-placeholder.tsx ➕ ADD       ← Shown while video is still processing
│   │   │   └── hooks/              ➕ ADD         ← use-video-progress, use-playback, use-volume, use-quality
│   │   │
│   │   ├── quiz/                   ➕ ADD         ← QUIZ SYSTEM
│   │   │   ├── quiz-attempt.tsx    ➕ ADD         ← Main quiz-taking container
│   │   │   ├── quiz-question.tsx   ➕ ADD         ← Question renderer (MCQ, true/false, short answer)
│   │   │   ├── quiz-option.tsx     ➕ ADD         ← Single answer option button
│   │   │   ├── quiz-timer.tsx      ➕ ADD         ← Countdown timer (if timed quiz)
│   │   │   ├── quiz-result.tsx     ➕ ADD         ← Score, pass/fail, correct answers revealed
│   │   │   ├── quiz-progress.tsx   ➕ ADD         ← "Question 3 of 10" progress indicator
│   │   │   ├── hooks/              ➕ ADD         ← use-quiz, use-attempt, use-quiz-mutations
│   │   │   └── quiz-builder/       ➕ ADD         ← ADMIN QUIZ BUILDER
│   │   │       ├── quiz-builder.tsx ➕ ADD        ← Drag-drop question list
│   │   │       ├── question-form.tsx ➕ ADD       ← Add/edit question (RHF + Zod)
│   │   │       └── option-field.tsx  ➕ ADD       ← Dynamic answer option inputs
│   │   │
│   │   ├── dashboard/              ➕ ADD         ← STUDENT DASHBOARD COMPONENTS
│   │   │   ├── stats-card.tsx      ➕ ADD         ← KPI card (enrolled count, completed, streak)
│   │   │   ├── enrolled-course-card.tsx ➕ ADD    ← Course card with progress bar + resume button
│   │   │   ├── recent-activity.tsx ➕ ADD         ← Recent lesson completions list
│   │   │   ├── learning-streak.tsx ➕ ADD         ← Streak calendar / flame icon + day count
│   │   │   ├── completion-chart.tsx ➕ ADD        ← Recharts doughnut (completed vs in-progress)
│   │   │   └── certificate-card.tsx ➕ ADD        ← Earned certificate preview + download button
│   │   │
│   │   ├── admin/                  ➕ ADD         ← ADMIN-SPECIFIC COMPONENTS; split by domain as it grows
│   │   │   ├── analytics/
│   │   │   │   ├── overview-cards.tsx ➕ ADD      ← Revenue, enrollments, completion KPI cards
│   │   │   │   ├── revenue-chart.tsx  ➕ ADD      ← Recharts bar/line chart
│   │   │   │   ├── enrollment-chart.tsx ➕ ADD    ← Enrollments over time
│   │   │   │   └── top-courses.tsx    ➕ ADD      ← Top 5 courses by enrollment table
│   │   │   │
│   │   │   ├── course-editor/
│   │   │   │   ├── course-editor.tsx     ➕ ADD   ← Master edit form with tabs
│   │   │   │   ├── basic-info-form.tsx   ➕ ADD   ← Title, subtitle, category (RHF)
│   │   │   │   ├── description-editor.tsx ➕ ADD  ← Tiptap rich text editor
│   │   │   │   ├── thumbnail-upload.tsx  ➕ ADD   ← Image upload + preview + crop
│   │   │   │   ├── pricing-form.tsx      ➕ ADD   ← Price, discount, free toggle
│   │   │   │   ├── settings-form.tsx     ➕ ADD   ← Level, language, requirements, status
│   │   │   │   └── seo-form.tsx          ➕ ADD   ← Slug, meta title, meta description
│   │   │   │
│   │   │   ├── curriculum-builder/
│   │   │   │   ├── curriculum-builder.tsx ➕ ADD  ← Drag-drop section/lesson reordering
│   │   │   │   ├── section-form.tsx       ➕ ADD  ← Add/rename section (RHF)
│   │   │   │   ├── lesson-form.tsx        ➕ ADD  ← Add/edit lesson (title, type, content)
│   │   │   │   ├── lesson-video-upload.tsx ➕ ADD ← Video upload + media job status tracking
│   │   │   │   ├── lesson-content-editor.tsx ➕ ADD ← Tiptap for article-type lessons
│   │   │   │   └── lesson-type-picker.tsx ➕ ADD  ← VIDEO | ARTICLE | QUIZ selector
│   │   │   │
│   │   │   ├── students/
│   │   │   │   ├── students-table.tsx    ➕ ADD   ← TanStack Table: search, filter, paginate
│   │   │   │   ├── student-actions.tsx   ➕ ADD   ← Row actions: view, suspend, export
│   │   │   │   └── student-drawer.tsx    ➕ ADD   ← Slide-over with student detail
│   │   │   │
│   │   │   ├── coupons/
│   │   │   │   ├── coupon-form.tsx       ➕ ADD   ← Create/edit coupon (RHF + Zod)
│   │   │   │   ├── coupons-table.tsx     ➕ ADD   ← Coupon list with status + actions
│   │   │   │   └── coupon-badge.tsx      ➕ ADD   ← Active / Expired / Depleted badge
│   │   │   │
│   │   │   ├── announcements/
│   │   │   │   ├── announcement-form.tsx ➕ ADD   ← Tiptap + audience selector (all/students/admins)
│   │   │   │   └── announcements-table.tsx ➕ ADD ← List with edit/delete actions
│   │   │   │
│   │   │   └── export-import/
│   │   │       ├── export-menu.tsx       ➕ ADD   ← JSON / CSV / Excel export buttons
│   │   │       ├── import-modal.tsx      ➕ ADD   ← File upload + preview + confirm import
│   │   │       └── import-preview.tsx    ➕ ADD   ← Table preview of rows to be imported
│   │   │
│   │   │   └── hooks/              ➕ ADD         ← Admin-only query/mutation hooks colocated with admin
│   │   │
│   │   ├── forms/                  ➕ ADD         ← COMPOSED FORM FIELDS (RHF + Radix-backed UI primitives)
│   │   │   ├── field-input.tsx     ➕ ADD         ← Label + Input + error message (one component)
│   │   │   ├── field-textarea.tsx  ➕ ADD         ← Label + Textarea + error
│   │   │   ├── field-select.tsx    ➕ ADD         ← Label + Select + error
│   │   │   ├── field-checkbox.tsx  ➕ ADD         ← Checkbox + label + error
│   │   │   ├── field-switch.tsx    ➕ ADD         ← Switch + label + description
│   │   │   ├── field-date.tsx      ➕ ADD         ← Date picker field
│   │   │   ├── field-rich-text.tsx ➕ ADD         ← Tiptap wrapped as RHF Controller field
│   │   │   ├── field-file.tsx      ➕ ADD         ← File upload with preview + validation
│   │   │   └── field-tags.tsx      ➕ ADD         ← Multi-tag chip input
│   │   │
│   │   └── skeletons/              ➕ ADD         ← LOADING SKELETONS (one per page/section)
│   │       ├── course-card-skeleton.tsx    ➕ ADD
│   │       ├── course-detail-skeleton.tsx  ➕ ADD
│   │       ├── dashboard-skeleton.tsx      ➕ ADD
│   │       ├── table-skeleton.tsx          ➕ ADD
│   │       ├── profile-skeleton.tsx        ➕ ADD
│   │       └── player-skeleton.tsx         ➕ ADD
│   │
│   │   ├── permissions/             ➕ ADD         ← CLIENT-SIDE ABILITY HELPERS (server remains source of truth)
│   │   │   ├── ability.ts           ➕ ADD         ← can(user, 'course.publish'), can(user, 'payment.refund')
│   │   │   ├── roles.ts             ➕ ADD         ← owner/student role-to-capability mapping mirror
│   │   │   └── guards.ts            ➕ ADD         ← requireAuth(), requireCapability(), requireRecentAuth()
│   │
│   │   ├── analytics/               ➕ ADD         ← PRODUCT EVENT TRACKING (privacy-safe)
│   │   │   ├── events.ts            ➕ ADD         ← Typed events: video_started, quiz_submitted, checkout_started
│   │   │   ├── track.ts             ➕ ADD         ← track(event, payload) with redaction
│   │   │   ├── providers.ts         ➕ ADD         ← Internal analytics / web-vitals adapters
│   │   │   └── hooks.ts             ➕ ADD         ← useTrackPageView(), useTrackEvent()
│   │
│   │   ├── pwa/                     ➕ ADD         ← INSTALL + OFFLINE SYNC SUPPORT
│   │   │   ├── offline-queue.ts     ➕ ADD         ← Queue safe progress/comment mutations while temporarily offline
│   │   │   ├── sync-status.ts       ➕ ADD         ← Online/offline and pending sync state
│   │   │   └── install-prompt.ts    ➕ ADD         ← PWA install prompt helpers
│   │
│   │   ├── uploads/                 ➕ ADD         ← UPLOAD WORKFLOWS SPLIT BY FILE TYPE
│   │   │   ├── image/               ➕ ADD         ← Thumbnail and course image upload helpers
│   │   │   ├── video/               ➕ ADD         ← Multipart video upload, progress, retry, processing state
│   │   │   ├── document/            ➕ ADD         ← Resources, assignment files, invoices
│   │   │   └── avatar/              ➕ ADD         ← Profile image upload/crop flow
│   │
│   │
│   ├── hooks/                      ➕ ADD         ← SHARED HOOKS ONLY; feature hooks live with the feature
│   │   ├── use-debounce.ts          ➕ ADD         ← Shared debounce helper for search/filter inputs
│   │   ├── use-media-query.ts       ➕ ADD         ← Shared responsive helper
│   │   ├── use-copy.ts              ➕ ADD         ← Copy to clipboard + reset state
│   │   └── use-key-press.ts         ➕ ADD         ← Global keyboard shortcuts only
│   │
│   │
│   ├── store/                      ➕ ADD         ← ZUSTAND STORES (global client state only)
│   │   ├── auth.store.ts           ➕ ADD         ← { user, role, isAuthenticated } + setUser, clearAuth
│   │   ├── theme.store.ts          ➕ ADD         ← { colorTheme, mode } + setTheme, setMode, persist
│   │   ├── player.store.ts         ➕ ADD         ← { volume, quality, playbackRate, currentTime, isMuted }
│   │   ├── ui.store.ts             ➕ ADD         ← { sidebarOpen, commandOpen, activeModal, notifications[] }
│   │   └── cart.store.ts           ⏳ LATER       ← Add only if bundles/cart checkout needs persistent client state
│   │
│   │
│   ├── services/                   ➕ ADD         ← SHARED PURE API CALL FUNCTIONS ONLY (no React, no hooks)
│   │   │                                          ← Feature-owned services stay beside their feature hooks
│   │   │                                          ← All authenticated calls use fetch-client.ts
│   │   ├── auth.service.ts         ➕ ADD         ← login, logout, register, getMe, refreshToken
│   │   ├── course.service.ts       ➕ ADD         ← getCourses, getCourseBySlug, createCourse, updateCourse, deleteCourse
│   │   ├── enrollment.service.ts   ➕ ADD         ← enroll, unenroll, getMyEnrollments, checkEnrollment
│   │   ├── progress.service.ts     ➕ ADD         ← getLessonProgress, markComplete, updateWatchTime
│   │   ├── quiz.service.ts         ➕ ADD         ← getQuiz, submitAttempt, getAttemptHistory
│   │   ├── certificate.service.ts  ➕ ADD         ← getCertificates, getById, regenerate
│   │   ├── payment.service.ts      ➕ ADD         ← createOrder, verifyPayment (Razorpay flow)
│   │   ├── coupon.service.ts       ➕ ADD         ← validateCoupon, getCoupons, createCoupon, deleteCoupon
│   │   ├── notification.service.ts ➕ ADD         ← getNotifications, markRead, markAllRead
│   │   ├── announcement.service.ts ➕ ADD         ← getAnnouncements, createAnnouncement, delete
│   │   ├── user.service.ts         ➕ ADD         ← getMe, updateProfile, changePassword, uploadAvatar
│   │   ├── analytics.service.ts    ➕ ADD         ← getRevenueChart, getEnrollmentStats, getTopCourses
│   │   ├── review.service.ts       ➕ ADD         ← getCourseReviews, submitReview, deleteReview
│   │   ├── note.service.ts         ➕ ADD         ← getLessonNotes, createNote, updateNote, deleteNote
│   │   ├── discussion.service.ts   ➕ ADD         ← getComments, postComment, deleteComment
│   │   ├── upload.service.ts       ⚠️ AVOID       ← Prefer app/uploads/{image,video,document,avatar}/ services
│   │   └── export.service.ts       ➕ ADD         ← exportStudentsCSV, exportEnrollmentsJSON, exportRevenueXLSX
│   │
│   │
│   ├── providers/                  ➕ ADD         ← REACT CONTEXT PROVIDERS
│   │   ├── app-providers.tsx       ➕ ADD         ← Composes ALL providers in correct nesting order
│   │   ├── query-provider.tsx      ➕ ADD         ← TanStack <QueryClientProvider> + <ReactQueryDevtools>
│   │   ├── theme-provider.tsx      ➕ ADD         ← Reads Zustand theme store → sets data-theme + data-mode on <html>
│   │   ├── auth-provider.tsx       ➕ ADD         ← On mount: calls getMe() → hydrates Zustand auth.store
│   │   └── socket-provider.tsx     ➕ ADD         ← Connects Socket.IO on auth → disconnects on logout
│   │
│   │
│   ├── routes/                     ✅ EXISTS      ← ROUTE MODULES (one file = one page)
│   │   ├── home.tsx                ✅ EXISTS      ← / (prerendered) — keep, may extend
│   │   ├── courses.tsx             ✅ EXISTS      ← /courses — keep, extend with filters + search
│   │   ├── course-detail.tsx       ✅ EXISTS      ← /courses/:slug — keep, extend with enroll CTA
│   │   ├── login.tsx               ✅ EXISTS      ← /login — keep, wire to auth.service + Zustand
│   │   ├── register.tsx            ✅ EXISTS      ← /register — keep, wire to auth.service
│   │   │
│   │   ├── about.tsx               ➕ ADD         ← /about (prerendered)
│   │   ├── pricing.tsx             ➕ ADD         ← /pricing (prerendered)
│   │   ├── contact.tsx             ➕ ADD         ← /contact (prerendered)
│   │   ├── privacy.tsx             ➕ ADD         ← /privacy (prerendered)
│   │   ├── terms.tsx               ➕ ADD         ← /terms (prerendered)
│   │   │
│   │   ├── auth.forgot-password.tsx ➕ ADD        ← /forgot-password
│   │   ├── auth.reset-password.tsx  ➕ ADD        ← /reset-password?token=...
│   │   ├── auth.verify-email.tsx    ➕ ADD        ← /verify-email?token=...
│   │   │
│   │   ├── dashboard._layout.tsx   ➕ ADD         ← /dashboard layout (auth guard in loader)
│   │   ├── dashboard._index.tsx    ➕ ADD         ← /dashboard — student home overview
│   │   ├── dashboard.my-courses.tsx ➕ ADD        ← /dashboard/my-courses — enrolled courses grid
│   │   ├── dashboard.learn._layout.tsx ➕ ADD     ← /dashboard/learn layout with lesson shell
│   │   ├── dashboard.learn.$id.lesson.tsx ➕ ADD  ← /dashboard/learn/:id/lesson — full player page
│   │   ├── dashboard.learn.$id.quiz.tsx ➕ ADD    ← /dashboard/learn/:id/quiz — quiz attempt
│   │   ├── dashboard.learn.$id.notes.tsx ➕ ADD   ← /dashboard/learn/:id/notes — notes view
│   │   ├── dashboard.learn.$id.discussion.tsx ➕ ADD ← /dashboard/learn/:id/discussion — Q&A/comments
│   │   ├── dashboard.profile.tsx   ➕ ADD         ← /dashboard/profile — edit profile + avatar
│   │   ├── dashboard.certificates.tsx ➕ ADD      ← /dashboard/certificates — all earned certs
│   │   ├── dashboard.certificates.$id.tsx ➕ ADD  ← /dashboard/certificates/:id — view + download
│   │   ├── dashboard.notifications.tsx ➕ ADD     ← /dashboard/notifications — full list
│   │   ├── dashboard.wishlist.tsx  ➕ ADD         ← /dashboard/wishlist
│   │   ├── dashboard.billing.tsx   ➕ ADD         ← /dashboard/billing — purchase history
│   │   ├── dashboard.settings.tsx  ➕ ADD         ← /dashboard/settings — account preferences
│   │   │
│   │   ├── checkout.$courseId.tsx  ➕ ADD         ← /checkout/:courseId — Razorpay payment page
│   │   ├── checkout.success.tsx    ➕ ADD         ← /checkout/success — confirmation + confetti
│   │   │
│   │   ├── admin._layout.tsx       ➕ ADD         ← /admin layout (loader: role === 'ADMIN' only)
│   │   ├── admin._index.tsx        ➕ ADD         ← /admin — overview dashboard
│   │   ├── admin.courses._index.tsx ➕ ADD        ← /admin/courses — manage courses table
│   │   ├── admin.courses.new.tsx   ➕ ADD         ← /admin/courses/new — create course
│   │   ├── admin.courses.$id.tsx   ➕ ADD         ← /admin/courses/:id — edit course (CourseEditor)
│   │   ├── admin.courses.$id.curriculum.tsx ➕ ADD ← /admin/courses/:id/curriculum — CurriculumBuilder
│   │   ├── admin.students._index.tsx ➕ ADD       ← /admin/students — all students table
│   │   ├── admin.students.$id.tsx  ➕ ADD         ← /admin/students/:id — student detail
│   │   ├── admin.enrollments.tsx   ➕ ADD         ← /admin/enrollments — all enrollments
│   │   ├── admin.analytics.tsx     ➕ ADD         ← /admin/analytics — revenue + completion charts
│   │   ├── admin.coupons.tsx       ➕ ADD         ← /admin/coupons — coupon CRUD
│   │   ├── admin.announcements.tsx ➕ ADD         ← /admin/announcements — platform broadcasts
│   │   ├── admin.certificates.tsx  ➕ ADD         ← /admin/certificates — certificate management
│   │   ├── admin.settings.tsx      ➕ ADD         ← /admin/settings — platform config
│   │   └── admin.export-import.tsx ➕ ADD         ← /admin/export-import — data tools
│   │
│   │
│   ├── styles/                     ➕ ADD         ← ADDITIONAL STYLE FILES (app.css stays as primary)
│   │   ├── themes.css              ➕ ADD         ← Light mode first; optional academy color themes later
│   │   ├── typography.css          ➕ ADD         ← @tailwindcss/typography prose overrides for Tiptap output
│   │   ├── animations.css          ➕ ADD         ← @keyframes: shimmer, fade-in, slide-up, scale-in
│   │   └── player.css              ➕ ADD         ← Vidstack player CSS token overrides
│   │
│   │
│   ├── types/                      ⚠️ AVOID       ← Do not create a broad frontend type source of truth
│   │                                          ← Import domain/API/form types from @veolms/contracts
│   │                                          ← Keep UI-only types beside the component that owns them
│   │
│   │
│   └── utils/                      ➕ ADD         ← PURE UTILITY FUNCTIONS (no React, testable)
│       ├── format.ts               ➕ ADD         ← formatPrice (₹1,299), formatDuration (2h 30m), formatDate
│       ├── validate.ts             ➕ ADD         ← isValidEmail, isStrongPassword (client-side helpers)
│       ├── transform.ts            ➕ ADD         ← flattenCurriculum, groupLessonsBySection
│       ├── url.ts                  ➕ ADD         ← buildCourseUrl('/courses/slug'), getSearchParam()
│       ├── storage.ts              ➕ ADD         ← Type-safe localStorage/sessionStorage wrappers
│       ├── error.ts                ➕ ADD         ← parseApiError(err) → { message, status, code }
│       └── certificate.ts          ➕ ADD         ← generateCertificatePDF(data) — jsPDF logic
│
│
├── public/                         ➕ ADD         ← STATIC ASSETS (CDN-cached, served as-is)
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   ├── og-image.png                             ← Default Open Graph / social share image
│   ├── manifest.webmanifest                     ← PWA manifest
│   ├── robots.txt
│   ├── fonts/                                   ← Self-hosted Inter font files
│   │   └── inter/
│   │       ├── inter-400.woff2
│   │       ├── inter-500.woff2
│   │       └── inter-600.woff2
│   └── images/
│       ├── logo.svg
│       ├── logo-dark.svg
│       ├── hero-illustration.svg
│       ├── empty-courses.svg
│       ├── empty-notifications.svg
│       └── certificate-bg.png
│
│
├── tests/                          ➕ ADD         ← E2E TESTS (Playwright)
│   ├── e2e/
│   │   ├── auth/
│   │   │   ├── login.spec.ts                    ← Login + invalid credentials + redirect
│   │   │   └── register.spec.ts                 ← Register + email validation + success
│   │   ├── public/
│   │   │   ├── landing.spec.ts                  ← Homepage renders, shows courses
│   │   │   └── catalog.spec.ts                  ← Browse + search + filter courses
│   │   ├── student/
│   │   │   ├── enroll.spec.ts                   ← Enroll → payment → confirmation
│   │   │   ├── learn.spec.ts                    ← Video plays → mark complete → next
│   │   │   ├── quiz.spec.ts                     ← Take quiz → see result
│   │   │   └── certificate.spec.ts              ← Earn + download certificate
│   │   └── admin/
│   │       ├── course-create.spec.ts            ← Create course end-to-end
│   │       └── analytics.spec.ts                ← Analytics charts render
│   ├── fixtures/
│   │   ├── auth.ts                              ← Pre-authenticated browser contexts
│   │   └── course.ts                            ← Seeded test course helpers
│   └── playwright.config.ts
│
│
├── .env.example                    ➕ ADD         ← Committed env template (no secrets)
├── .gitignore                      ✅ EXISTS
├── .dockerignore                   ✅ EXISTS
├── package.json                    ✅ EXISTS      ← Extend with new deps
├── react-router.config.ts          ✅ EXISTS      ← Already well configured, keep as-is
├── tsconfig.json                   ✅ EXISTS
├── vite.config.ts                  ✅ EXISTS      ← Extend: add PWA plugin, path alias ~
└── vitest.config.ts                ➕ ADD         ← Vitest: jsdom env, coverage, setup file
```

---

## 🧩 Folder & File Explanations — Layer by Layer

### `app/routes/` — Routing Conventions

React Router v8 uses an **explicit route manifest** in `routes.ts` (already exists). Add new routes by importing and calling `route()`, `layout()`, `index()`:

```ts
// app/routes.ts (extend existing)
import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

export default [
  // ✅ Existing — keep
  index("routes/home.tsx"),
  route("courses", "routes/courses.tsx"),
  route("courses/:slug", "routes/course-detail.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),

  // ➕ Auth extras
  route("forgot-password", "routes/auth.forgot-password.tsx"),
  route("reset-password", "routes/auth.reset-password.tsx"),

  // ➕ Dashboard (protected layout)
  layout("routes/dashboard._layout.tsx", [
    index("routes/dashboard._index.tsx"),
    route("my-courses", "routes/dashboard.my-courses.tsx"),
    layout("routes/dashboard.learn._layout.tsx", [
      route("learn/:id/lesson", "routes/dashboard.learn.$id.lesson.tsx"),
      route("learn/:id/quiz", "routes/dashboard.learn.$id.quiz.tsx"),
      route("learn/:id/notes", "routes/dashboard.learn.$id.notes.tsx"),
      route(
        "learn/:id/discussion",
        "routes/dashboard.learn.$id.discussion.tsx",
      ),
    ]),
    route("profile", "routes/dashboard.profile.tsx"),
    route("certificates", "routes/dashboard.certificates.tsx"),
    route("certificates/:id", "routes/dashboard.certificates.$id.tsx"),
  ]),

  // ➕ Admin (role-protected layout)
  layout("routes/admin._layout.tsx", [
    index("routes/admin._index.tsx"),
    route("courses", "routes/admin.courses._index.tsx"),
    route("courses/new", "routes/admin.courses.new.tsx"),
    route("courses/:id", "routes/admin.courses.$id.tsx"),
    // ...
  ]),
] satisfies RouteConfig;
```

Each route file exports:

- `loader()` — server-side data fetch (runs at build for prerendered pages)
- `clientLoader()` — client-side data fetch (private/auth pages)
- `action()` / `clientAction()` — form submissions, mutations
- `meta()` — `<title>` + `<meta>` tags (SEO)
- `default` — the React component
- `ErrorBoundary` — per-route error UI

Use feature-specific error boundaries for large areas (`learn`, `admin`, `dashboard`) so a player/editor failure does not collapse the whole app. Lazy-load admin, dashboard, player, and editor routes; keep public catalogue pages lean and prerender-friendly.

---

### API Functions and `fetch-client.ts`

| File                             | Purpose                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `app/lib/api.ts` ✅              | Keep only for existing public prerender loaders until those calls move into feature services. Do not grow this into a second API layer. |
| `app/lib/fetch-client.ts` ➕     | Shared authenticated fetch wrapper. Reads session/auth state, handles 401 → refresh → retry, and maps API errors.                       |
| `app/**/{feature}.service.ts` ➕ | Preferred home for resource-specific API calls, colocated with feature hooks when the feature owns the workflow.                        |

```ts
// lib/fetch-client.ts
export async function authFetch(url: string, init?: RequestInit) {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    /* refresh + retry */
  }
  if (!res.ok) throw new ApiError(res.status, await res.json());
  return res.json();
}
```

---

### `app/config/features.ts` — Feature Flags

Use feature flags for staged rollout and to keep V1 scope disciplined:

```ts
export const features = {
  certificates: true,
  wishlist: false,
  discussion: true,
  coupons: true,
  ai: false,
} as const;
```

Do not hide incomplete authorization or payment behavior only with client-side flags. Server-side capability checks still decide what is allowed.

---

### `app/permissions/` — Ability Layer

`protected-route.tsx` should stay thin. Put permission logic in:

- `ability.ts` for named capability checks like `course.publish` and `payment.refund`.
- `roles.ts` for the V1 owner/student capability mapping mirror.
- `guards.ts` for route-loader helpers like `requireAuth()` and `requireCapability()`.

The frontend permission layer is for UX and route flow only. The API remains the authority.

---

### `app/analytics/` — Event Tracking

Track product events with typed payloads and redaction:

- `video_started`
- `video_completed`
- `lesson_opened`
- `quiz_submitted`
- `certificate_downloaded`
- `coupon_applied`
- `checkout_started`

Keep direct identifiers, auth tokens, and payment-sensitive data out of analytics payloads.

---

### Performance Strategy

- Lazy-load admin, dashboard, player, and editor routes.
- Split heavy dependencies such as Tiptap, Vidstack, Recharts, and jsPDF away from public catalogue bundles.
- Use `@tanstack/react-virtual` for large admin tables, notification lists, and long lesson lists.
- Report Web Vitals such as LCP, INP, and CLS through the analytics provider.
- Keep prerendered public pages free of private session/enrollment data.

---

### `app/store/` — Zustand Slices

Each store = one concern. Use `devtools` + `persist` middleware where needed:

```ts
// store/auth.store.ts
export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        setAuth: (user, token) =>
          set({ user, accessToken: token, isAuthenticated: true }),
        clearAuth: () =>
          set({ user: null, accessToken: null, isAuthenticated: false }),
      }),
      {
        name: "veolms-auth",
        partialize: (s) => ({ accessToken: s.accessToken }),
      },
    ),
  ),
);
```

```ts
// store/theme.store.ts — reads by theme-provider.tsx, writes to <html>
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      colorTheme: "default", // default | green | blue | pink | yellow | rose
      mode: "dark", // dark (already in app.css) | light
      setTheme: (t) => set({ colorTheme: t }),
      setMode: (m) => set({ mode: m }),
    }),
    { name: "veolms-theme" },
  ),
);
```

---

### TanStack Query Hooks

Use TanStack Query hooks beside the feature that owns them. Keep `app/hooks/` for tiny shared UI hooks only.

Naming: `use-{resource}.ts` for queries, `use-{resource}-mutations.ts` for mutations.

```ts
// components/course/hooks/use-courses.ts
// Wraps course.service.ts functions inside useQuery
export function useCourses(filters?: CourseFilters) {
  return useQuery({
    queryKey: ["courses", filters],
    queryFn: () => getCourses(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCourse(slug: string) {
  return useQuery({
    queryKey: ["courses", slug],
    queryFn: () => getCourse(slug),
    enabled: !!slug,
  });
}
```

---

### `app/providers/app-providers.tsx` — Provider Order

Order matters — inner providers can use hooks from outer providers:

```tsx
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      {" "}
      {/* 1st — TanStack Query (auth uses useQuery inside) */}
      <ThemeProvider>
        {" "}
        {/* 2nd — reads Zustand, writes to <html> */}
        <AuthProvider>
          {" "}
          {/* 3rd — calls getMe() query on mount */}
          <SocketProvider>
            {" "}
            {/* 4th — connects Socket.IO after auth */}
            {children}
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
```

Wire into `root.tsx`:

```tsx
// app/root.tsx — extend existing Layout
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="default" data-mode="dark">
      <head>...</head>
      <body>
        <AppProviders>
          <Header />
          {children}
          <Toaster /> {/* Sonner toast container */}
        </AppProviders>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

---

### `app/styles/themes.css` — Theme System

Extends the **existing CSS variable system** in `app.css` (dark mode, purple accent). Add light mode first. Additional academy color themes are optional and should wait until branding needs justify them:

```css
/* styles/themes.css — @import this in app.css */

/* ─── Light mode override ─── */
:root[data-mode="light"] {
  color-scheme: light;
  --color-background: #ffffff;
  --color-surface: #f4f4f5;
  --color-surface-raised: #e4e4e7;
  --color-border: #d4d4d8;
  --color-text: #09090b;
  --color-text-muted: #71717a;
}

/* Later optional theme example */
:root[data-theme="green"] {
  --color-accent: hsl(142 71% 45%);
  --color-accent-hover: hsl(142 71% 55%);
  --color-focus: hsl(142 71% 75%);
}

/* Add more only after a real academy branding requirement exists. */
```

---

### `packages/contracts` — Extend for Forms

Currently `contracts` only has API response schemas. Extend with form schemas too:

```ts
// packages/contracts/src/auth.ts  ← ADD
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

// packages/contracts/src/course.ts  ← EXTEND
export const createCourseSchema = z.object({
  title: z.string().min(3).max(100),
  shortDescription: z.string().min(10).max(200),
  price: z.number().min(0),
  // ...
});
```

Frontend uses for RHF validation. Backend (Fastify) uses same schema for request body validation.

Do not duplicate domain/API types in `apps/web/types`. Import course, auth, payment, progress, quiz, notification, and analytics types from `@veolms/contracts`. If a type exists only for a local UI composition, keep it beside that component, for example `components/admin/students/table-types.ts`.

---

## ⚙️ Key Config Files

### `vite.config.ts` — Extend Existing

```ts
// Current: tailwindcss() + reactRouter() + proxy + port
// Add:
import { VitePWA } from 'vite-plugin-pwa'

plugins: [
  tailwindcss(),
  reactRouter(),
  VitePWA({ registerType: 'autoUpdate', manifest: { name: 'VeoLMS', ... } })
]

resolve: {
  alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) }
  // Enables: import { Button } from '~/components/ui/button'
}
```

### Radix UI Component Convention

No generator config file is needed.

Install the required Radix primitive packages directly. Create app-owned wrappers in `app/components/ui/` only when the wrapper adds branding, variants, composition, or repeated behavior. Simple primitives like `Label`, `Separator`, or `Skeleton` can be direct imports or tiny local components.

Each wrapper should:

- Import the relevant `@radix-ui/react-*` primitive.
- Apply VeoLMS Tailwind classes and CSS variables.
- Use `cva` only where variants are actually useful.
- Export stable app-level components such as `Dialog`, `Select`, `Tabs`, `Tooltip`, and `DropdownMenu`.
- Keep feature-specific composition outside `components/ui/`.

### `vitest.config.ts` — New

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
```

---

## 🔀 Merge Checklist

When merging into `d:\veo-lms\veolms\apps\web`:

- [ ] **Keep all existing files** (`root.tsx`, `routes.ts`, `app.css`, `lib/api.ts`, `config/academy.ts`, all 5 route files, `header.tsx`, `course-card.tsx`)
- [ ] Extend `routes.ts` — add new routes, don't remove existing ones
- [ ] Extend `app.css` — import new `styles/themes.css`, don't delete existing CSS classes
- [ ] Extend `root.tsx` — wrap body with `<AppProviders>`, add `<Toaster />`
- [ ] Extend `vite.config.ts` — add `~` alias, PWA plugin
- [ ] Run `pnpm install` from monorepo root after adding new deps to `package.json`
- [ ] Run `pnpm --filter @veolms/web typecheck` to verify TypeScript
- [ ] Run `pnpm --filter @veolms/web dev` to start dev server
