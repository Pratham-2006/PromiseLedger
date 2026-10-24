# Supabase Integration Plan

**Status:** Planning only. This document does not create a Supabase project, configure credentials, or change application behavior.

## Goal and constraints

Add account-backed synchronization to PromiseLedger while preserving the current local-first workflow, domain behavior, and a safe way to move existing browser data into a user's cloud account.

The current application is a Vite + React + TypeScript client. Its `Database` model is currently persisted as one localStorage object with commitments, customers, user preferences, and history events embedded on each commitment. The integration should introduce a repository boundary so UI components and domain rules no longer depend directly on localStorage or Supabase.

### MVP decisions

- Use Supabase Auth email/password first; design the auth boundary so another provider can be added later.
- Treat each account as its own workspace for the first cloud release. Every user-owned row carries `user_id`; team sharing is explicitly out of scope.
- Use the Supabase JavaScript v2 client directly in the Vite browser app with the project URL and **publishable** key. RLS is the authorization boundary.
- Never put a Supabase secret/service-role key in Vite environment variables or browser code.
- Keep local storage as a migration/recovery source and short-lived client cache. Once cloud mode is enabled, the database is authoritative after successful synchronization.
- Use versioned SQL migrations in `supabase/migrations`; never make undocumented schema-only changes in the hosted dashboard.
- Keep sample/demo records local-only, or explicitly exclude them from normal cloud migration and sync.

### Initial implementation refinement

The first cloud release uses one `workspace_states` row per authenticated user with a versioned JSONB `Database` snapshot. The existing application reads and writes an aggregate `Database` and keeps lifecycle history nested in each commitment; one row lets a save or local-data migration commit atomically and keeps this MVP small. A revision-checked RPC prevents silent overwrites between tabs/devices. The normalized `customers` / `commitments` / `commitment_events` model below is a future migration option if query, reporting, or collaboration needs outgrow the single-user snapshot. It is not the first integration schema.

## Proposed database model

The first schema is intentionally aligned with the current `Database` aggregate:

| Table | Main columns | Purpose and constraints |
| --- | --- | --- |
| `workspace_states` | `user_id uuid primary key references auth.users on delete cascade`, `state jsonb`, `revision bigint`, `updated_at timestamptz` | One private current snapshot for each account. The JSON must have `schemaVersion: 1`, `commitments[]`, `customers[]`, and `settings{}`. Apply a 4 MB serialized-size limit in the initial migration. |

The snapshot preserves current nullable local-calendar due dates and `timestamptz` history values without lossy client-side remapping. The current derived overdue/today behavior remains client-side based on the user's local date. If the model is normalized later, use SQL `date` for deadlines and `timestamptz` for event instants.

### User ownership and RLS

Enable RLS on `workspace_states`. Revoke `anon` privileges and grant only `SELECT`, `INSERT`, and `UPDATE` to `authenticated`; add explicit policies using `user_id = (select auth.uid())` and matching `WITH CHECK` rules. The save RPC is `SECURITY INVOKER`, derives ownership from `auth.uid()`, validates the snapshot shape/size, and requires the expected revision. It must not trust a caller-provided `user_id`. Account deletion cascades the workspace row from `auth.users`.

The browser's publishable key is expected to be public. It does not provide authorization; the signed-in user's access token plus database grants and RLS do. Do not depend on hidden UI controls or client-provided `user_id` values as security checks. Do not ship a service/secret key.

## Application architecture changes

Introduce these boundaries before replacing persistence:

1. `src/lib/supabase.ts`: create one typed Supabase client, validate `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and export it.
2. `src/data/WorkspaceProvider.tsx`: own session loading, email/password sign-up/sign-in/reset/sign-out, subscription cleanup, local migration choice, cloud cache, and save queue.
3. Keep existing domain operations over the `Database` aggregate. Cloud reads query one row; cloud saves call one revision-checked RPC.
4. React UI: represent `loading`, `ready`, `saving`, `offline`, and `conflict` states. Preserve local source data during first-login choices.

Do not let feature components call `.from(...)` or `.rpc(...)` directly. Keep status/deadline/history rules in the domain layer; one snapshot RPC persists the resulting state atomically.

## Required client APIs

The implementation should use the current `@supabase/supabase-js` v2 APIs. Exact imports and generated database types should be added when implementation begins.

### Client setup

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !publishableKey) throw new Error('Supabase is not configured')

export const supabase = createClient<DatabaseTypes>(url, publishableKey)
```

Provide `.env.example` containing variable names and placeholders only. Keep `.env.local` ignored by Git. Validate redirect URLs and deployed app URLs in Supabase Auth settings.

### Auth calls

| User action | Supabase API | Expected application behavior |
| --- | --- | --- |
| Create account | `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })` | Handle confirmation-required response without assuming a session exists immediately. |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` | Load the user's cloud data only after an authenticated session is available. |
| Restore/listen to session | `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange(callback)` | Render a session-loading state; unsubscribe on provider unmount. Treat `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, and `TOKEN_REFRESHED` intentionally. |
| Sign out | `supabase.auth.signOut()` | First settle or warn about pending writes; clear user-scoped in-memory data. Never expose the previous account's records while signed out or switching users. |
| Request password reset | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | Use the same generic success response whether or not the account exists. |
| Set new password | `supabase.auth.updateUser({ password })` | Only after the verified recovery redirect/session flow. |

### Data calls

The client adds `.eq('user_id', userId)` as a defense-in-depth filter even though RLS is mandatory. Treat Supabase errors as authoritative; a missing row is an empty workspace only when the authenticated query succeeded.

| Operation | API shape |
| --- | --- |
| Load account snapshot | `supabase.from('workspace_states').select('state, revision').eq('user_id', userId).maybeSingle()` |
| Save initial state or mutation | `supabase.rpc('save_workspace_state', { p_state: database, p_expected_revision: revision })`; only mark synced after successful return of the next revision. |
| Resolve ambiguous network result | Re-read the row and compare normalized state; if revision changed with different state, show an explicit reload/overwrite choice. |
| Sign out | `supabase.auth.signOut()` after queued writes settle; clear account state from memory and scope browser cache by user ID. |
| Live collaboration | Deferred. If needed later, add realtime subscriptions only after defining conflict resolution for the snapshot. |

Check `.error` for every request. Mutations do not imply that selected rows were returned unless `.select()` is chained. Do not rely on an unfiltered `update()` or `delete()`.

### Transactional RPC functions

The initial integration provides one narrow function because the whole app state is saved as a single row:

- `save_workspace_state(p_state jsonb, p_expected_revision bigint)`: validate the owner, schema version, required top-level shapes, and payload size; atomically insert/update the caller's row only if the expected revision matches; return the incremented revision.
- When tables are normalized later, replace full-snapshot saves with narrow transactional functions for create/edit/status/progress/import operations.

The function verifies `auth.uid()` is non-null, runs as invoker, is granted only to `authenticated`, uses an empty `search_path` with qualified names, and never accepts an owner ID from the client. No service key or Edge Function is part of this release.

## Local data migration and sync strategy

The current app has no accounts and may have meaningful records only in `localStorage`. Signing in must never silently replace either the browser data or cloud data.

1. Keep the current LocalRepository and export format working while introducing authentication.
2. On first sign-in, query the cloud for the account and inspect local storage. If cloud is empty and local records exist, show a migration choice: **Import local records**, **Start with cloud empty**, or **Export backup first**. Never auto-upload demo records.
3. If both local and cloud records exist, show counts and require an explicit choice: merge, keep cloud, or cancel and export. Do not choose a winner silently.
4. During import, preserve IDs only when valid and collision-free; otherwise map old IDs to UUIDs and rewrite customer IDs/event commitment IDs. Deduplicate customers by normalized name within that account. Do not deduplicate commitments based only on title/date because repeated promises can be legitimate.
5. Validate the entire backup before mutation; import atomically or report clearly that nothing was imported. Keep the original local backup until the user verifies cloud records and chooses to remove local data.
6. Persist a migration receipt (timestamp, source count, imported count, skipped count, mapping/version) so refreshes and retries do not accidentally duplicate records.
7. After confirmation of cloud mode, make cloud writes authoritative. Local cache writes may support offline display, but must show a sync state and retry queue; do not claim a cloud save when the request failed.

For the first release, recommend explicit one-time migration and online-only writes rather than a background bidirectional sync engine. Offline queue/conflict resolution should be a separate milestone after durable server IDs and change semantics exist.

## Edge cases and required handling

| Scenario | Required handling |
| --- | --- |
| Missing/invalid environment variables | Fail early with actionable setup text in development; no crash loop in production; do not silently fall back to a different user's local data. |
| Expired session, refresh failure, or sign-out in another tab | Stop authenticated requests, clear user-scoped UI state, show sign-in, retain unsynced changes safely and label them unsynced. |
| Email confirmation required or redirect URL mismatch | Explain pending confirmation and configured redirect requirements; avoid reporting sign-up as signed in until a session exists. |
| Auth callback race during initial `getSession()` | Use one session source of truth and avoid stale async results replacing a newer signed-out/account-switched state. |
| Network loss, timeout, Supabase outage, rate limit | Keep form values, distinguish retryable errors, avoid duplicate create on retry (stable request/idempotency ID), expose last sync state; no false success toast. |
| Double-click/retry during create or import | Disable while pending and use idempotent RPC/import receipt so retries do not duplicate rows/events. |
| Two tabs edit same commitment | Detect stale `updated_at` (optimistic concurrency), then offer reload or deliberate overwrite; never silently discard the other edit. |
| User A signs out, User B signs in on same browser | Clear A's in-memory data and cache keys before rendering B; partition any cache/queue by user ID; never upload A's pending queue as B. |
| RLS misconfigured / wrong owner | Test `anon`, user A, and user B separately; ensure reads/writes/deletes cannot cross accounts, including foreign-key relationships and RPC paths. |
| RLS makes a query look empty | Distinguish empty account from unavailable/unauthorized state; inspect returned errors and expected profile/account readiness. |
| Customer rename/case/whitespace duplicates | Normalize consistently, enforce unique `(user_id, normalized_name)`, and handle unique-conflict races by reloading/merging rather than creating duplicate customers. |
| Commitment and event partial save | Use a transaction/RPC. If not available temporarily, show partial failure and repair by reloading; never suppress event insert errors. |
| Delete event/history integrity | Delete only selected user's commitment; cascade its events; do not accidentally cascade-delete a customer shared by other commitments. |
| Invalid/legacy local data | Reuse existing normalization/validation, validate dates and finite amounts, keep malformed source untouched and offer export/recovery. |
| Legacy local IDs or duplicate IDs | Build a migration ID map; reject/repair duplicates before writes; never assume name-derived IDs are UUIDs. |
| Local demo/sample records | Exclude from cloud import unless user explicitly opts in; keep DEMO labels; cleanup must only target known sample IDs. |
| Empty/null deadline | Store SQL `NULL`, keep it out of overdue ordering/indicators, and sort nulls consistently. |
| Time zone / daylight saving | Store due dates as SQL `date`; store event instants as UTC `timestamptz`; continue deriving overdue based on local calendar day. Avoid parsing `YYYY-MM-DD` through UTC date conversion. |
| Amount precision / currency | Preserve exact decimal representation (avoid JS floating-point loss for money); validate non-negative/maximum range and currency code. If changing `number` to decimal-string domain types is necessary, migrate all format/parse paths deliberately. |
| Pagination beyond first page | Use stable ordering and range/cursor pagination; ensure dashboard counts and customer history are not accidentally computed from only the loaded page. |
| Import exceeds request/body limits | Set a documented maximum, chunk only if transactionality/idempotence is preserved; otherwise reject before writing and retain the backup. |
| User requests account deletion | Provide an explicit confirmation, delete `user_settings`, customers, commitments/events according to documented FK cascade behavior, and handle Auth account deletion through a trusted server-side/admin path; don't expose service credentials in the client. |
| Backup export while cloud is authoritative | Export a consistent snapshot including commitment events, settings and schema version; indicate whether unsynced local changes are included. |
| Database migration fails or is out of sync | Stop deploy, inspect `supabase migration list`, reconcile migration history deliberately; never patch the remote schema manually without capturing a migration. |

## Implementation phases and acceptance criteria

### Phase 0 — Decisions and project setup

- Confirm initial auth method, whether cloud records are private per account, and whether demo/sample data should ever sync.
- Create/choose the Supabase project and configure local/staging environments outside the repo; add only placeholder env names to `.env.example`.
- Install the Supabase CLI as a development tool or document a pinned `npx supabase` workflow; initialize CLI config and migration directory.
- Acceptance: no secrets are committed; local app remains functional without Supabase configuration until auth/cloud mode is explicitly enabled.

### Phase 1 — Schema, migration, RLS

- Add a versioned migration for the snapshot table, grants, RLS policies, and revision-checked RPC.
- Define TypeScript database types and validate snapshot data when it crosses the client/server boundary.
- Add database/RLS tests for anonymous, owner, and cross-user access.
- Acceptance: the migration rebuilds the schema; anonymous and cross-user reads/writes fail; a signed-in owner can save/read a full state snapshot and stale revisions are rejected.

### Phase 2 — Auth and repository boundary

- Add `@supabase/supabase-js`, typed client setup, auth provider, loading/error states, sign-up, sign-in, password reset, and sign-out.
- Keep the workspace provider as the temporary storage boundary; extract local/cloud repository interfaces if the app grows beyond whole-state saves.
- Acceptance: session restore works after reload; sign-out clears account data from view; storage/account switching does not leak data; existing local-only mode still works.

### Phase 3 — Cloud CRUD and history

- Persist all commitment, customer, settings, and history mutations through the revision-checked snapshot RPC.
- Keep the full snapshot under the configured size limit and show save/offline/conflict states; do not silently overwrite a newer revision.
- Acceptance: all lifecycle actions and history persist after reload; failed requests remain in a user-scoped recovery cache and expose retry/reload/overwrite actions.

### Phase 4 — Existing-data migration

- Add first-login migration decision UI and safe local backup preflight.
- Implement atomic import, ID mapping, per-account customer dedupe, migration receipt, retry behavior, and post-import verification.
- Acceptance: test empty/partial/malformed local data, empty cloud, existing cloud, duplicates, and interrupted/retried import; source data remains recoverable until explicit user confirmation.

### Phase 5 — Release readiness

- Configure Auth site URL/redirect URLs, custom SMTP for production email flows, and production environment variables.
- Verify RLS with two independent users, production build, auth redirects, backup/restore, rate-limit/error states, and migration from the current localStorage schema.
- Add monitoring for client-visible failures without logging commitment/customer content or auth tokens.
- Acceptance: deployment contains only publishable client credentials, every public table has verified RLS/grants, and a documented backup/restore/account-deletion procedure exists.

### Deferred follow-up

- Offline write queue and bidirectional conflict resolution.
- Team/workspace sharing and role-based access.
- Realtime subscriptions and push notifications.
- Server-side APIs/Edge Functions except for explicitly trusted operations that cannot be safely expressed as authenticated, RLS-protected database transactions.

## Official documentation references

Supabase documentation was checked on 2026-10-24. Re-check these pages when implementation begins because APIs and dashboard settings can change.

- [Supabase React Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react) — Vite client setup and auth flow.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) — publishable versus secret keys and browser/server boundaries.
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords) — sign-up, password sign-in, confirmation, reset, SMTP constraints.
- [JavaScript `onAuthStateChange`](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) — session lifecycle events and subscription cleanup.
- [JavaScript Auth overview](https://supabase.com/docs/reference/javascript/auth) — session persistence and client behavior.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS, grants, explicit operation policies, `auth.uid()`, policy testing.
- [JavaScript `update`](https://supabase.com/docs/reference/javascript/update) — filtered update and returning rows.
- [JavaScript `resetPasswordForEmail`](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) — password recovery API.
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations) — migration files, team workflow, remote history.
- [Local development CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows) — local schema and migration workflow.
- [Cascade deletes](https://supabase.com/docs/guides/database/postgres/cascade-deletes) — FK deletion semantics for events and commitments.
