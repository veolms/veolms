# VeoLMS Backend Architecture Review & Engineering Guide

---

## 1. Tech Stack Overview

| Layer / Tool                     | Technology Used                     | Details                                                                    |
| :------------------------------- | :---------------------------------- | :------------------------------------------------------------------------- |
| **Monorepo Manager**             | `pnpm` (v11.18.0)                   | Uses workspaces and root `catalog:` for locked dependencies.               |
| **Monorepo Build System**        | `Turborepo` (v2.10.8)               | Pipeline orchestrator for `dev`, `build`, `typecheck`, `lint`.             |
| **Language & Runtime**           | Node.js (v24+) + TypeScript (v6.x)  | Native ECMAScript Modules (`"type": "module"`).                            |
| **Backend Framework**            | `Fastify` (v5.11)                   | High-performance, plugin-based HTTP server.                                |
| **API Autoloading**              | `@fastify/autoload` (v6.5)          | Auto-discovers and registers `src/modules/**/*.routes.ts`.                 |
| **Contract & Schema Validation** | `fastify-type-provider-zod` + `Zod` | Shared Zod schemas compile to OpenAPI 3.0 via `@fastify/swagger`.          |
| **Database & ORM**               | `PostgreSQL` + `Kysely`             | Type-safe SQL query builder and schema migration runner.                   |
| **Authentication & Security**    | `@simplewebauthn/server` + Crypto   | Passwordless OTP (Email/SMS), TOTP MFA, WebAuthn/Passkeys, signed cookies. |
| **Frontend Application**         | React 19 + React Router + Vite      | TailwindCSS, Vitest, Playwright E2E.                                       |

---

## 2. Current Folder Structures

### 2.1 Global Monorepo Folder Structure

```text
veolms-code/
├── apps/
│   ├── api/                     # Fastify Backend API
│   ├── web/                     # React Frontend Web App
│   ├── fleet-manager/           # Infrastructure Manager (Future shell)
│   └── media-worker/            # Media Transcoding Worker (Future shell)
├── packages/
│   ├── config/                  # Validated environment schemas (@veolms/config)
│   ├── contracts/               # Shared Zod API request/response contracts (@veolms/contracts)
│   └── database/                # Kysely DB schema, migrations, seeds & queries (@veolms/database)
├── docs/                        # Architecture & engineering documentation
└── compose.yaml                 # Docker Compose (PostgreSQL, local services)
```

### 2.2 Current Backend API Structure (`apps/api/src/`)

```text
apps/api/src/
├── app.ts                       # Fastify application factory & autoload registration
├── config.ts                    # Server configuration instance
├── index.ts                     # HTTP listener entry point
├── openapi.ts                   # Swagger/OpenAPI setup
├── lib/
│   ├── errors.ts                # AppError class, error codes, OpenAPI error schemas
│   ├── logger.ts                # Pino logger configuration
│   ├── responses.ts             # Envelope response helper (jsonResponse)
│   └── route-plugin.ts          # RoutePlugin TypeScript types
├── middlewares/
│   ├── auth.middleware.ts       # Authentication & MFA step-up middleware guards
│   └── error.middleware.ts      # Centralized error handler
├── services/                    # Outbound integration services
│   ├── email/                   # Nodemailer email transport & templates
│   ├── sms/                     # SMS gateway transports (HTTP / Console)
│   └── index.ts                 # AppServices composition root
├── types/
│   └── fastify.d.ts             # Fastify request type augmentations (user, session)
└── modules/                     # Feature-sliced API modules
    ├── auth/                    # Complete Auth & Identity domain
    ├── courses/                 # Course catalogue domain
    └── health/                  # Health check domain
```

### 2.3 Current `src/modules/auth/` Folder Structure

```text
src/modules/auth/
├── auth.constants.ts            # TTLs, rate limits, role names
├── auth.context.ts              # Factory assembling middleware, service & preHandlers
├── auth.cookies.ts              # Cookie reading/writing helper functions
├── auth.presenters.ts           # Login response formatter (presentLogin)
├── auth.repository.ts           # Kysely database queries (users, sessions, OTP, TOTP, passkeys)
├── auth.routes.ts               # Routes: OTP send/login/register, logout, /auth/me
├── auth.service.ts              # Service: OTP validation, user creation, session generation
├── auth.utils.ts                # Crypto utilities (hashing, AES encryption, PKCE, TOTP)
├── mfa.routes.ts                # Routes: TOTP setup/enable, Passkeys setup/login, Step-up MFA
├── oauth.provider.ts            # OAuth profile fetcher (Google & GitHub) + PKCE verification
├── oauth.routes.ts              # Routes: OAuth URLs, OAuth login & register
├── session.routes.ts            # Routes: Active session listing, session revocation
└── setup.routes.ts              # Routes: Token verification, Creator registration, Academy setup
```

---

## 3. In-Depth Analysis: What Is Currently Happening Inside Auth & The Major Issues

Currently, the code functions correctly from an operational standpoint, but **architecturally it has severe structural flaws and anti-patterns**:

### Issue 1: "Fat Routes" with Too Many Responsibilities

In the current code, route files are doing everything at once in a single handler function:

- Declaring OpenAPI Zod schemas.
- Reading HTTP headers, cookies, IP addresses, and request bodies.
- Running cryptographic operations (TOTP verification, PKCE generation, constant-time token comparison).
- **Directly querying database tables.**
- **Executing database transactions directly inside route callbacks.**
- Setting HTTP response cookies and formatting JSON responses.

**Result:** Route files are massive and unreadable:

- `mfa.routes.ts` $\rightarrow$ **542 lines**
- `oauth.routes.ts` $\rightarrow$ **317 lines**
- `setup.routes.ts` $\rightarrow$ **305 lines**
- `auth.routes.ts` $\rightarrow$ **288 lines**

---

### Issue 2: Routes are Directly Calling Database Models/Repositories (Skipping the Service Layer)

Routes should NEVER touch database queries or transactions. Currently, routes are querying the database directly:

1. **Raw Database Transactions Inside a Route File (`mfa.routes.ts` L130–147):**
   ```typescript
   // In mfa.routes.ts - Database transaction executed directly inside the HTTP route!
   await database.transaction().execute(async (trx) => {
     await repository.replaceTotpCredential(trx, {
       id: crypto.randomUUID(),
       userId,
       secretEncrypted: encryptSecret(secret, config.MFA_ENCRYPTION_KEY),
       lastUsedStep: String(result.step),
     });

     await repository.replaceBackupCodes(
       trx,
       userId,
       backupCodes.map((value) => ({
         id: crypto.randomUUID(),
         user_id: userId,
         code_hash: hashToken(value),
       })),
     );
   });
   ```
2. **Direct DB Querying in `session.routes.ts` (L39–42 & L75–79):**
   ```typescript
   // In session.routes.ts - Route handler directly calls repository without any Service
   const sessions = await repository.listUserSessions(
     database,
     request.user!.id,
   );
   await repository.deleteUserSession(
     database,
     request.user!.id,
     request.params.id,
   );
   ```
3. **Direct DB Querying in `setup.routes.ts` (L233–242):**
   ```typescript
   // In setup.routes.ts - Route handler mutates DB directly
   await repository.upsertAcademy(database, { ... });
   await repository.markSetupCompleted(database, academy.id);
   ```
4. **Direct DB Querying in `courses.routes.ts` (L34, L56):**
   ```typescript
   // In courses.routes.ts - Route directly imports database queries
   app.get("/courses", async () => ({
     courses: await listPublishedCourses(database),
   }));
   ```

---

### Issue 3: Interfaces and Types are Scattered Inconsistently

- Types and interfaces are defined randomly across different files (`auth.service.ts`, `setup.routes.ts`, `oauth.provider.ts`, `auth.context.ts`) instead of being centralized in contract/type definitions.
- For example, signed cookie schemas are declared inline inside route files (`setupSessionSchema` inside `setup.routes.ts`), while user creation inputs are in `auth.service.ts`, and API DTOs are in `@veolms/contracts`.

---

### Issue 4: Zero Portability & Untestable Business Logic

- Because business logic (e.g. TOTP activation, session revocation, academy setup locking) is trapped inside Fastify HTTP handler functions, it **cannot be unit-tested without starting a full HTTP server (`app.inject()`)**.
- If a background job (`media-worker`), a cron task, a CLI script, or a future WebSocket handler needs to revoke a session or verify an account, it cannot reuse the code because it is locked inside an HTTP route handler.

---

## 4. Is the Current Approach Good or Should We Change It?

### **Direct Answer: The Current Approach is NOT the Best Way and MUST Be Changed.**

### **Why We Must Change:**

1. **Lack of Consistency:** Right now, there is no standard pattern. Some endpoints call a Service (e.g. `service.sendOtp`), while other endpoints call the database repository directly (e.g. `session.routes.ts`, `setup.routes.ts`), and some run raw database transactions inside the route (`mfa.routes.ts`).
2. **Violation of Separation of Concerns:** Route files know about SQL queries, database transactions, cryptographic encryption, cookie hashing, and HTTP protocols all at the same time.
3. **Not Scalable to Millions of Users:** When the platform grows to handle payments, quizzes, reviews, and media streaming, having database calls scattered in route files will lead to duplicate queries, race conditions, un-cacheable data paths, and untracked database mutations.

---

## 5. The Target Approach: Strict Layered Architecture

We must enforce a strict, consistent 4-layer architecture across all modules:

```
[ 1. ROUTE PLUGIN (*.routes.ts) ]
  • ONLY declares URL Path, HTTP Verb, Zod OpenAPI Schema, and PreHandlers.
  • NEVER executes business logic or DB calls.
  • Immediately delegates request execution to the Controller.
                │
                │ Passes Fastify Request & Reply
                ▼
[ 2. CONTROLLER (*.controller.ts) ]
  • ONLY handles HTTP concerns:
    - Extracts inputs (request.body, request.params, request.cookies, request.ip).
    - Calls the Service with clean DTO objects.
    - Sets cookies (setSessionCookie), headers, and status codes (reply.code(201)).
    - Formats output via Presenters.
  • NEVER calls the Database or Repository directly!
                │
                │ Passes Pure DTO / Primitives
                ▼
[ 3. SERVICE LAYER (*.service.ts) ]
  • ONLY handles Business Logic & Domain Rules:
    - Validations, rate-limiting, step-up MFA rules.
    - Coordinates multi-table database transactions (database.transaction()).
    - Calls external gateways (Email, SMS, WebAuthn).
  • 100% HTTP-Agnostic: NEVER imports FastifyRequest or FastifyReply!
                │
                │ Executes Typed Queries
                ▼
[ 4. REPOSITORY LAYER (*.repository.ts) ]
  • ONLY executes Kysely SQL database queries against Postgres tables.
  • Accepts either Kysely<Database> or Transaction<Database> (trx).
  • ONLY called by the Service layer (Never by Routes or Controllers).
                │
                ▼
      [ PostgreSQL Database ]
```

---

## 6. The Invariant Rules for All Modules

### Rule 1: NEVER Call the Database / Repository in Routes or Controllers

- Routes and Controllers must **NEVER** import `kysely` or call `repository.*` functions.
- All database reading and writing must go through the **Service layer**.

### Rule 2: Controllers Are Strictly HTTP Adapters

- A Controller method must only extract request parameters, pass them to a Service method, set cookies/status codes on the reply, and return the response.

### Rule 3: Services Must Be 100% HTTP-Agnostic

- A Service method should never know if it was called by an HTTP request, a CLI tool, a background worker, or a unit test. It must receive plain inputs (strings, objects) and return plain outputs.

### Rule 4: Strict Cross-Module Isolation (No Cross-Module DB Queries)

- **Module A (e.g. `courses` or `discussions`) must NEVER query Module B's (`auth`) database tables or import Module B's repository.**
- If Module A needs data from Module B, it must call Module B's public **Service** method or listen to an asynchronous domain event.

---

## 7. Standardized Module Folder Structure

Every module in `apps/api/src/modules/` should follow this standardized structure:

```text
src/modules/<module-name>/
├── <module-name>.routes.ts          # Fastify route registration & Zod schemas (lean, < 100 lines)
├── controllers/
│   └── <feature>.controller.ts      # HTTP adapter (Request/Reply parsing & cookie handling)
├── services/
│   └── <feature>.service.ts         # Business logic, workflows & database transactions
├── <module-name>.repository.ts      # Pure Kysely SQL database queries
├── <module-name>.presenters.ts      # Output formatting & DTO mapping
├── <module-name>.constants.ts       # Module-specific constants
└── <module-name>.utils.ts           # Module-specific helper functions
```

---

## 8. Summary Comparison

| Aspect                 | Current Way (To Change)                     | Standard Target Architecture                         |
| :--------------------- | :------------------------------------------ | :--------------------------------------------------- |
| **Where DB is called** | Routes, Services, and DB packages directly. | **ONLY inside Services $\rightarrow$ Repositories.** |
| **Route file size**    | 300 to 550+ lines per file.                 | **Under 100 lines (only schemas & routes).**         |
| **Controller layer**   | Missing (merged into route files).          | **Dedicated `*.controller.ts` files.**               |
| **Service layer**      | Inconsistent & bypassed by routes.          | **Single source of truth for all business logic.**   |
| **Cross-module calls** | Direct DB queries across tables.            | **Strictly via public Service APIs or events.**      |
| **Testability**        | Hard (requires full HTTP server).           | **Easy (Services unit-tested in isolation).**        |
| **Scalability**        | High coupling blocks scaling.               | **Clean decoupled architecture ready for millions.** |
