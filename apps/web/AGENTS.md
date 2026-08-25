# Frontend agent instructions

These instructions apply to every file and feature under `apps/web`. Agents must follow them for all new frontend work and for every frontend file they modify.

## 1. VeoLMS Frontend API & State Management Pattern

Goal: Keep frontend API integration and state management simple, predictable, type-safe, and easy to scale.

### Standard Folder Pattern

```text
src/
├── lib/
│   ├── api-client.ts        # Axios client instance, interceptors, HTTP verbs
│   ├── query-client.ts      # TanStack QueryClient configuration
│   └── api-error.ts         # Standardized ApiError interface & getApiError helper
│
├── services/
│   ├── auth/
│   │   ├── auth.service.ts  # Pure backend API calls (no React hooks)
│   │   ├── auth.keys.ts     # Query key factory
│   │   ├── auth.queries.ts  # TanStack Query read hooks (useQuery)
│   │   ├── auth.mutations.ts# TanStack Query mutation hooks (useMutation)
│   │   └── index.ts         # Public domain barrel export
│   │
│   ├── courses/
│   ├── payments/
│   ├── media/
│   └── ...
│
├── store/
│   ├── ui.store.ts
│   ├── preferences.store.ts
│   └── auth.store.ts        # Shared frontend/client session state only
│
├── auth/
├── courses/
├── learning/
├── settings/
├── workspace/
└── shell/
```

### Layer Responsibilities

- `lib/`: Shared frontend infrastructure (HTTP client, TanStack Query client, error normalization).
- `services/<domain>/`: Backend communication for that domain (service functions, query/mutation hooks, query keys).
- `store/`: Shared frontend-only state (theme, sidebar state, active UI mode).
- `<feature>/`: UI components, pages, local UI logic, styling, feature-specific helpers.

### Main API Flow

```text
UI Component -> TanStack Query Hook -> Service -> API Client -> Backend
```

Example:
`LoginView.tsx` -> `useLogin()` (`auth.mutations.ts`) -> `authService.login()` (`auth.service.ts`) -> `api.post()` (`api-client.ts`) -> `POST /auth/login`

### State Ownership Rules

Use the correct state tool based on data ownership:

- **Server / Backend Data -> TanStack Query**: All data fetched from or synchronized with the backend (`currentUser`, `courses`, `sessions`, `notifications`, `reviews`, etc.).
- **Shared Frontend State -> Store**: Global or cross-component UI state only (`theme`, `sidebar`, `player preferences`, `temporary auth navigation state`).
- **Component State -> useState / useReducer**: State local to a single screen or component (`modal open`, `form field state`, `dropdown toggle`).

### Anti-Duplication Rule (Single Source of Truth)

Never duplicate server data into a global store.

- Avoid: `GET /me` -> TanStack Query -> copy full user object -> `auth.store`.
- Prefer: `GET /me` -> TanStack Query -> UI components consume query hook directly.
- `auth.store.ts` should only contain lightweight client-side authentication flags or temporary tokens if needed.

### Service File Pattern

- `*.service.ts`: Pure async functions making backend requests. No React hooks or component dependencies.
- `*.queries.ts`: TanStack Query read hooks (`useQuery`).
- `*.mutations.ts`: TanStack Query write/action hooks (`useMutation`) with query invalidations.
- `*.keys.ts`: Centralized query key factories using hierarchical tuples:
  ```typescript
  export const authKeys = {
    all: ["auth"] as const,
    me: () => [...authKeys.all, "me"] as const,
    sessions: () => [...authKeys.all, "sessions"] as const,
  };
  ```
- `index.ts`: Public API for the domain. Always import from `@/services/<domain>` or `../services/<domain>`, never deep import internal files from unrelated modules.

### Shared Contracts

Always import DTO request/response types and schemas from `@veolms/contracts`. Do not duplicate backend contracts locally in the frontend.

### Small vs Large Domain Scaling

- **Small Domain**: Start simple with `service.ts` + `use-<domain>.ts` + `index.ts`.
- **Large Domain**: Split into `service.ts`, `keys.ts`, `queries.ts`, `mutations.ts`, `index.ts`.
- Do not over-engineer tiny 1-endpoint domains prematurely.

### Patterns to Avoid

- UI calling `axios` or `api-client` directly.
- Services importing React components or UI stores.
- Features importing another feature's internal non-exported files.
- Duplicating server state into global client stores.
- Inconsistent import paths for the same service.

---

## 2. Required UI & Component Architecture

- Organize code by feature or product module, not by file type alone.
- Keep React components, hooks, utilities, tests, and exceptional styles close to the feature that owns them.
- Build features from small, focused components with one clear responsibility.
- Split large React, TypeScript, and JavaScript files before they become difficult to understand, test, or review.
- Extract repeated UI patterns into reusable components. Do not copy the same markup or long Tailwind class lists across multiple screens.
- Keep feature-specific behavior inside the feature. Move code into shared modules only when it is genuinely reused by multiple features.
- Prefer explicit component APIs and typed variants over scattered conditional class strings.

---

## 3. Tailwind-first Styling

- Use Tailwind CSS utilities for all new styling whenever Tailwind can express the design.
- Do not add plain CSS for convenience, familiarity, or to avoid composing Tailwind utilities.
- Do not add new rules to global CSS files.
- Existing CSS is legacy code and may remain unchanged unless the task explicitly requires refactoring it. Do not perform unrelated CSS migrations while implementing a feature.
- When repeated Tailwind classes represent a reusable UI element, create a small reusable component or a typed class/variant helper. Do not solve repetition by moving ordinary component styling into plain CSS.
- Use canonical Tailwind CSS v4 syntax. Prefer custom-property shorthand such as `bg-(--surface)`, `text-(--text)`, and `h-(--panel-height)` over arbitrary values such as `bg-[var(--surface)]`, `text-[var(--text)]`, and `h-[var(--panel-height)]`.
- Prefer Tailwind v4's generated numeric utilities such as `h-18`, `w-59.5`, or `max-w-345` when the value is derived from the spacing scale. Use an arbitrary dimension such as `h-[73px]` only when no canonical utility represents the intentional value.
- Keep arbitrary values for expressions Tailwind cannot represent canonically, including `calc(...)`, `color-mix(...)`, unusual units, and complex grid or shadow declarations.

---

## 4. Plain CSS Exceptions

Plain CSS is allowed only when the required behavior cannot reasonably be implemented with Tailwind CSS, including Tailwind's responsive, state, arbitrary-value, and arbitrary-variant capabilities.

When an exception is necessary:

1. Create a feature-local CSS file owned by that module; never place the rule in a global stylesheet.
2. Import the file only from the feature or component entry point that needs it.
3. Keep selectors narrowly scoped and namespaced to the owning feature.
4. Add only the unsupported CSS behavior; keep all other styling in Tailwind.
5. Briefly document why Tailwind could not express the behavior so future agents do not expand the exception casually.

---

## 5. Maintainability Requirements

- Preserve existing UI, behavior, accessibility, responsiveness, and performance unless the task explicitly changes them.
- Avoid monolithic components and catch-all feature files.
- Keep state and side effects as close as possible to the feature that owns them; extract focused hooks when logic becomes independently testable or reusable.
- Use semantic names based on product behavior, not visual accidents or temporary implementation details.
- Avoid hidden coupling between features, broad selectors, and imports that cause one module's styling or behavior to leak into another.
- Add or update focused tests for changed behavior. Run the relevant typecheck, lint, and tests before completing the work.

## Manual commit verification

- Do not add or configure a pre-commit hook for the browser memory regression tests.
- Before creating a commit that includes changes under `apps/web`, manually run the production-browser memory regression test suite in addition to the relevant typecheck, lint, and functional tests.
- Run memory checks against the production build and use the configured per-page baselines and budgets. Include ordinary pages without video and learning pages when they are affected by the change.
- If a memory check fails, do not proceed with the commit. Diagnose whether the failure is a product regression, a test problem, or an unstable measurement; fix the underlying issue and rerun the complete verification until it passes.
- If the memory suite is unavailable or cannot be run, report that clearly and do not claim that commit verification passed.

Before adding plain CSS or growing an already large file, stop and confirm that the change cannot be expressed as Tailwind utilities, a small feature component, a focused hook, or a reusable variant.
