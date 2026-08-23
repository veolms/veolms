# VeoLMS API agent instructions

These instructions apply to every file under `apps/api`. Task-specific user
instructions take precedence. Unless a task explicitly requests a behavior or
API change, refactors must preserve existing behavior and public contracts.

## Architecture

The default dependency direction is:

```text
Route -> Controller -> Service -> Repository -> Database
                         |
                         +-> Provider / Adapter / Email / SMS / Storage / Queue
```

Feature-first organization determines where files live. Layered architecture
determines how dependencies flow. Use both:

```text
Module -> Feature -> Route -> Controller -> Service -> Repository
```

The goal is predictable ownership and dependency flow, not more folders or
abstractions. Keep the smallest structure that is sufficient for the feature.

## Feature organization

Large modules with multiple independent workflows may use one folder per
feature. A feature folder may contain only the layers it actually needs; do not
create empty or ceremonial files.

Auth is the large-module reference implementation:

```text
src/modules/auth/
|- authentication/
|  |- authentication.controller.ts
|  |- authentication.repository.ts
|  |- authentication.routes.ts
|  |- authentication.service.ts
|  `- authentication.types.ts
|- otp/
|  |- otp.controller.ts
|  |- otp.repository.ts
|  |- otp.routes.ts
|  `- otp.service.ts
|- oauth/
|  |- oauth.controller.ts
|  |- oauth.provider.ts
|  |- oauth.repository.ts
|  |- oauth.routes.ts
|  `- oauth.service.ts
|- session/
|  |- session.controller.ts
|  |- session.repository.ts
|  |- session.routes.ts
|  `- session.service.ts
|- mfa/
|  |- mfa.controller.ts
|  |- mfa.repository.ts
|  |- mfa.routes.ts
|  `- mfa.service.ts
|- setup/
|  |- setup.controller.ts
|  |- setup.repository.ts
|  |- setup.routes.ts
|  `- setup.service.ts
|- shared/
|  |- auth.constants.ts
|  |- auth.cookies.ts
|  |- auth.presenters.ts
|  |- auth.types.ts
|  |- auth.utils.ts
|  `- shared composition/persistence types when genuinely reused
`- index.ts
```

Auth feature ownership is:

- `authentication`: login, registration, current user, and general account
  workflows. Its repository owns user and role persistence.
- `otp`: OTP generation, verification, resend/rate limits, delivery
  coordination, and OTP persistence.
- `oauth`: OAuth login/linking, provider integration, and OAuth account
  persistence.
- `session`: session creation, authentication, listing, revocation, and
  session persistence.
- `mfa`: TOTP, passkeys, backup codes, MFA verification, and MFA persistence.
- `setup`: academy onboarding, setup-token workflow, and setup persistence.
- `shared`: code genuinely used by multiple Auth features. Do not use it as a
  dumping folder.

`auth/index.ts` is the Auth module public entry point. Export public services or
use cases needed by other modules; never export Auth repositories as a
cross-module API. The Auth composition context and repository executor type
may live under `shared/` because multiple Auth features use them.

Courses must retain its feature-first shape. In particular, keep the main
Course feature in `courses/course/` rather than flattening it into the module
root:

```text
src/modules/courses/
|- category/
|- configuration/
|- course/
|- curriculum/
|- lifecycle/
|- shared/
`- index.ts
```

For small modules, use a flat feature folder instead of creating unnecessary
subfolders:

```text
src/modules/notifications/
|- notifications.routes.ts
|- notifications.controller.ts
|- notifications.service.ts
|- notifications.repository.ts
`- index.ts
```

Do not maintain a layer-first structure such as module-level
`controllers/`, `services/`, `repositories/`, and `providers/` for new or
refactored modules.

## Layer responsibilities

### Routes

Routes declare the URL, HTTP method, request/response schemas, OpenAPI
metadata, middleware/pre-handlers, and controller to invoke. Routes must not
contain SQL, Kysely, repository calls, transactions, provider calls, or
multi-step business workflows.

### Controllers

Controllers translate HTTP into transport-independent service input. They may
read request body, params, query, headers, cookies, IP, and user/session
context; call a service; choose a presenter; set status codes; and set or clear
cookies. Controllers must not import or call repositories, Kysely, database
executors, transactions, or reusable business workflows.

Simple HTTP input normalization is acceptable in a controller or a genuinely
shared HTTP helper. Business policy belongs in a service.

### Services

Services own business rules, use-case workflows, authorization decisions for
the use case, transactions and transaction boundaries, repository calls,
provider calls, and application/domain errors. Services receive values rather
than Fastify request/reply objects.

Repositories must remain usable with either the normal database executor or a
transaction executor. Services decide policy; repositories only persist and
retrieve data.

### Repositories

Repositories contain Kysely queries and database-specific select, insert,
update, and delete operations for tables owned by their feature. They must not
decide product policy, start workflows, call Fastify, or query another module's
owned tables.

### Providers and adapters

Providers isolate third-party behavior such as OAuth, WebAuthn, email, SMS,
storage, queues, or payment gateways. They validate untrusted provider
responses and return application-friendly results. Services decide whether and
how to use those results.

## Team rules

1. Every endpoint must be declared by a `.routes.ts` plugin and delegate to a
   controller.
2. Controllers handle HTTP only and never call repositories.
3. Services contain reusable business rules and own transactions.
4. Repositories contain all Kysely/database access.
5. Database details must not leak into routes or controllers.
6. Public request/response contracts belong in `@veolms/contracts`. Use those
   contracts for API communication between the backend and frontend.
7. Keep service, repository, and provider types close to the layer that owns
   them. Do not create one giant types file.
8. A module owns its business logic, repositories, and database tables.
9. Cross-module synchronous communication uses the owning module's public
   service/use case. Asynchronous work uses a domain event. Never import
   another module's private repository or query its tables directly.
10. Within a large module, respect feature ownership. If one Auth feature
    needs an operation owned by another feature, call that feature's service
    rather than bypassing it with a repository import.
11. Do not add Clean Architecture layers, CQRS, event sourcing, generic base
    repositories, interfaces, or dependency injection solely for symmetry.
    Add abstractions only when they solve a real coupling, testing, reuse, or
    ownership problem.
12. Move feature-specific code into the owning feature. Put code in `shared/`
    only when multiple features genuinely use it.

## Contracts and behavior preservation

Unless a task explicitly requests an API or behavior change, preserve:

- route URLs and HTTP methods;
- request and response schemas and `@veolms/contracts` types;
- OpenAPI operation IDs and documented behavior;
- success/error status codes, error codes, messages, and envelopes;
- cookie names, signing, expiry, security attributes, and clearing behavior;
- authentication, authorization, MFA, CSRF, and rate-limit behavior;
- provider security checks and failure handling;
- database writes, transaction boundaries, concurrency protections, and
  business rules.

When moving code, preserve security-sensitive ordering, including checking
account existence before consuming an OTP, validating OAuth state before code
exchange, consuming WebAuthn challenges once, and enforcing MFA step-up before
factor replacement.

## Fastify route registration

`apps/api/src/app.ts` autoloads all files below `src/modules` whose names end in
`.routes.ts`, including nested feature folders. Therefore:

- every route plugin must default-export the expected `RoutePlugin`;
- route paths must be unique;
- do not register an endpoint from two files;
- do not put helpers in a `.routes.ts` filename;
- preserve the configured `/api/v1` prefix;
- audit the full route list after moving route files.

Keep route schemas next to their route declarations. Shared public schemas and
request/response contracts belong in `@veolms/contracts`.

## Safe implementation workflow

Before changing a module:

1. Read its routes, controllers, services, repositories, providers, contracts,
   middleware, and tests together.
2. Search all imports and route registration points before moving or deleting a
   file.
3. Check for uncommitted work and preserve unrelated changes.
4. Identify the public behavior that must remain unchanged.
5. Choose the smallest structure that solves the actual ownership problem.

While changing code:

1. Move behavior without rewriting it unnecessarily.
2. Keep dependencies one-directional.
3. Keep transactions in services and database details in repositories.
4. Keep controllers free of reusable business logic.
5. Keep cross-module communication on public services or events.
6. Do not create empty folders or ceremonial abstractions.

After changing code:

1. Run the narrowest relevant tests.
2. Run the API typecheck.
3. Run formatting and lint checks for changed files.
4. Audit routes for missing or duplicate endpoints.
5. Search routes/controllers for database and repository imports.
6. Review the diff for accidental contract, cookie, status, transaction, or
   security changes.
7. Report pre-existing failures separately from failures caused by the change.
