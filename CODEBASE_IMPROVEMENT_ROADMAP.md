# PromiseLedger Codebase and Product Roadmap

**Audience:** AI coding agents implementing future work in this repository.

**Repository baseline reviewed:** `main` at `f81107f7ca7fcda691deea98e06b14c59c95fee9` (2026-10-24).
**Scope:** concrete architecture work, Supabase backend evolution, useful product features, tests, and release gates. This is an implementation plan; it does not apply migrations to a hosted database.

## Instructions for the implementing agent

Execute phases in order. First inspect the current branch and this document; do not assume it is still at the baseline commit above. Keep existing local-only mode, backup compatibility, and current promise/history behavior working unless a phase explicitly changes them.

For each task:

1. Implement the smallest complete vertical slice. Include UI, domain validation, persistence, database migration/RLS, documentation, and tests where applicable.
2. Add a new forward-only migration. Never edit a migration that may already have been applied to any Supabase environment.
3. Use Supabase local development and test users first. Do not run `supabase db reset --linked`, `supabase db push --linked`, destructive SQL, or a production deployment as part of an unattended coding step.
4. Do not read, print, commit, or paste `.env` values. Use only `.env.example` placeholders in tracked files. Never put service/secret keys in Vite variables or browser code.
5. Check `error` on every Supabase call. RLS must remain the data boundary; client-side workspace/user filters are an extra filter, never the authorization rule.
6. Run the repository's focused tests, database tests, and production build after changes. Add CI so later pull requests run the same checks.
7. Commit each completed phase with a descriptive message. Push only to the configured GitHub repository and never deploy the hosted schema without an explicit human go-ahead.
8. Finish each phase with: changed files, migration number, checks run and results, known limits, and any manual Supabase Dashboard configuration still required.

Do not skip a failing check by changing, deleting, or weakening an existing test. Fix the behavior or explain the specific external dependency that prevents the check from running.

## Current codebase map

| Area | Current files | Current responsibility |
| --- | --- | --- |
| UI | `src/App.tsx`, `src/styles.css` | All app pages, navigation, modals, forms, and almost all styling. |
| Domain | `src/domain/types.ts`, `commitments.ts`, `dates.ts`, `filter.ts`, `parser.ts`, `sampleData.ts` | Commitment/customer models, lifecycle transformations, local date math, filters, deterministic capture parsing, and demo records. |
| Local persistence | `src/domain/storage.ts` | Browser storage normalization, legacy migration, backup validation/export. |
| Auth/cloud | `src/data/WorkspaceProvider.tsx`, `src/lib/supabase.ts`, `src/lib/database.types.ts` | Supabase Auth, workspace loading, local-data choices, cache, full-snapshot RPC saves, and conflict handling. |
| Database | `supabase/migrations/20261024000000_create_workspace_states.sql` | One private `workspace_states` JSONB row per authenticated user, RLS, and revision-checked save RPC. |
| Tests | `src/domain/domain.test.ts` | 15 Vitest tests for date math, parser, lifecycle/filter behavior, and local storage recovery. |
| Setup | `README.md`, `SUPABASE_INTEGRATION_PLAN.md`, `package.json`, `vite.config.ts` | Local setup, current Supabase setup, build and test commands. |

The current checkout was clean and its `origin/main` SHA matched the reviewed baseline. The public GitHub page could not be fetched through the browser reader, so this analysis used the local `main` checkout and verified its SHA against `git ls-remote`.

## Findings that should drive the work

### P0 — correctness and trust

1. **Settings copy is wrong in cloud mode.** `SettingsPage` in `src/App.tsx` says the app has no account/cloud connection and that imports/clears affect local data, even though the app now supports authenticated cloud workspaces. Pass the actual storage mode into Settings and make privacy, export, import, and clear copy accurately describe which workspace is affected.
2. **Cloud state is a whole-workspace JSONB snapshot.** Every edit sends the complete database object. It is simple and atomic for one account, but all commitments and nested history are rewritten on each mutation; the single row has a 4 MB limit and one revision makes unrelated edits conflict. SQL cannot efficiently query overdue work across users, assignments, or notification schedules.
3. **History is mutable with the snapshot.** `Commitment.history` is nested in a client-submitted object. RLS protects the row from other accounts, but the owner can replace or remove their own history through the save function. This is acceptable for a personal MVP, not an immutable audit ledger. Do not describe it as tamper-proof.
4. **Auth/cloud lifecycle needs integration coverage.** The provider handles several races and recovery cases, but there are no tests for session restoration, sign-out/account switching, migration choices, queue failures, revision conflicts, or RLS. Current unit tests do not exercise the Supabase layer.
5. **A migration has not been proven on a local Supabase stack.** The current SQL was designed for the dashboard SQL Editor. Add CLI-managed local schema reconstruction and database tests before adding more tables or relying on an applied remote schema.
6. **The settings description and backup affordance do not explain pending cloud saves.** A cloud export can include the current in-memory state while the sync status is still pending. Label backup provenance and whether data has reached the server; warn before sign-out/navigation if unsynced account cache data could be stranded.

### P1 — maintenance and reliability

1. `src/App.tsx` contains navigation, all pages, all modals, and many long single-line JSX trees. `WorkspaceProvider.tsx` owns auth, storage, migrations, sync, recovery, and UI gates. These files make review and targeted testing harder; split them by responsibility without changing behavior.
2. There is no lint/format command or GitHub Actions workflow. The project currently has only `npm test` and `npm run build` gates.
3. `vite` and `@vitejs/plugin-react` are in `dependencies`; they are build-time tools and belong in `devDependencies`.
4. `npm install` reported 9 dependency advisories (6 moderate, 1 high, 2 critical) at integration time. Inspect the current audit report, identify affected direct/transitive packages, then update in controlled compatible steps. Do not run `npm audit fix --force` blindly.
5. `src/domain/commitments.ts` relies on UI validation for some invariants, converts monetary input to JavaScript `number`, uses a non-null assertion for the linked customer, and permits lifecycle operations without a centralized transition policy. Move validation into domain/application functions and return typed errors.
6. `normalizeDatabase` is deliberately forgiving for local migrations; using the same normalization for cloud input can silently repair/drop invalid fields. Add strict cloud/backup parsing separate from permissive legacy-local migration.
7. `SUPABASE_INTEGRATION_PLAN.md` still describes work as a plan and some proposed phases as pending even though the first implementation exists. Keep implementation status and commands synchronized with the code.
8. `npm run dev` binds to `0.0.0.0`. Prefer loopback (`localhost`) by default; document an explicit opt-in for LAN testing.

## Target architecture

Use this separation as the codebase grows:

```text
src/
  app/                 application shell, router, shared providers
  features/
    auth/               sign-in, account, recovery
    commitments/        pages, forms, detail view, client hooks
    customers/          customer directory and profile
    notifications/      reminder inbox and preferences
    reports/            summaries and export
  domain/               types, validation, lifecycle rules, date/money helpers
  data/
    repositories/       local and Supabase adapters
    mappers/            strict DB-row <-> domain mapping
  lib/                  Supabase client, generated DB types, error mapping
```

Keep React components unaware of SQL table names. A repository/application service owns data calls; domain functions own validation and transition rules. Keep timestamps in UTC and deadlines as local calendar dates. Use generated TypeScript types from the migrated Supabase schema rather than hand-maintaining table/function signatures indefinitely.

## Ordered implementation backlog

### Phase 0 — Repair and test the existing cloud MVP

Do this before feature work or schema expansion.

1. **Correct cloud/local UX copy.** Pass `mode`, `syncState`, and account email into Settings. Show whether backup export is from local mode, current cloud state, or a cloud cache with unsynced changes. Rename “Clear all local data” to the active workspace context. Never imply a cloud save completed while `syncState` is `saving`, `offline`, or `conflict`.
2. **Add boundary validation.** Introduce a strict `parseWorkspaceState(unknown)` that requires `schemaVersion === 1`, valid settings, unique non-empty IDs, valid categories/statuses, real ISO calendar dates or null, finite non-negative amounts, and well-formed history references. Keep `normalizeDatabase` for old local backups; do not use it to silently erase malformed server data.
3. **Centralize domain rules.** Add a typed `DomainError`/result boundary and validate create/edit/status/progress operations inside `src/domain/commitments.ts`. Define allowed transitions. Reject empty titles/customers, invalid dates, unsafe amounts, and edits to a missing customer instead of relying on form controls or a `!` assertion.
4. **Protect money values.** Replace floating-point `number` for currency amounts with integer minor units or a validated decimal string. Add one parser/formatter for supported ISO currency codes. Include values such as `0.10`, large values, invalid exponent notation, and pasted currency symbols in test cases.
5. **Add provider tests.** Cover session loading vs. auth callbacks, email-confirmation signup, recovery flow, sign-out, switching user A to B, initial empty state, cloud-load error, corrupted cache, import/merge/keep-cloud choices, duplicate retry, server-committed-but-response-lost retry, stale revision, overwrite confirmation, and sign-out with queued/offline changes.
6. **Fix status and presentation mismatches.** Replace static “My business” labels if account/workspace data is available. Check greeting/page titles and current privacy text. Ensure loading/sync states are announced accessibly and buttons remain usable on mobile.
7. **Dependency review.** Move `vite` and `@vitejs/plugin-react` to dev dependencies. Run `npm audit --json`, inspect advisory paths, record chosen versions, then update only compatible packages and rebuild. Do not claim an advisory is fixed until the installed lockfile and audit confirm it.

**Acceptance:** local-only mode still works without `.env`; cloud/local Settings copy is accurate; strict parsing never converts an unreadable cloud row into an empty successful workspace; provider and domain tests cover the cases above; production build succeeds.

### Phase 1 — Reproducible Supabase development and release checks

1. Initialize Supabase CLI config in `supabase/config.toml`. Pin/document a CLI version and add package scripts such as `db:start`, `db:reset`, `db:test`, `db:types`. Do not store project secrets in config.
2. Make local schema reproduction the standard: `npx supabase start`, `npx supabase db reset`, `npx supabase test db`, then generate TypeScript database types. Keep committed migrations as the only schema source of truth.
3. Add `supabase/seed.sql` with fictional, non-sensitive records for local development. Never seed production or rely on seeded data for an authorization test.
4. Add pgTAP tests proving signed-out/`anon` cannot read or write `workspace_states`, user A cannot read/write user B’s row, authenticated owner can read/save their row, revision conflicts reject stale writes, invalid shape/oversize state fails, and the row is deleted with its Auth user.
5. Add GitHub Actions for clean `npm ci`, lint, unit tests, build, Supabase local start/reset/test, and type generation drift check. Use no production secrets in pull-request CI.
6. Add an error mapper for Supabase Auth, PostgREST, network, payload-size, and revision-conflict errors. Keep user-visible text actionable and avoid logging email, notes, tokens, or whole workspace JSON.

**Acceptance:** a fresh checkout can recreate schema and seed data locally; the CI workflow proves RLS with at least two users; generated types match the current migration; setup docs no longer require pasting SQL manually for normal development.

### Phase 2 — Evolve from snapshot storage to normalized, queryable tables

The snapshot is the MVP contract and may already be applied by the user. Never remove or rename it in place. Add a new migration and a verified backfill path.

#### Target schema

Use UUID primary keys, `created_at`/`updated_at timestamptz`, and workspace-scoped foreign keys. Store due dates as SQL `date` and monetary values as `numeric(14,2)` (or minor units if the domain moves to integers). Preserve original deadlines and every existing history event.

| Table | Required fields and rules |
| --- | --- |
| `workspaces` | `id`, `owner_user_id references auth.users`, `name`, `timezone`, timestamps. Create one personal workspace per existing account during backfill. |
| `workspace_members` | `(workspace_id,user_id)` primary key, role `owner/admin/member`, invited/created metadata. A member may only hold one row per workspace. |
| `customers` | `id`, `workspace_id`, `name`, `normalized_name`, contact/notes, timestamps, `archived_at`; unique `(workspace_id, normalized_name)` and unique `(id, workspace_id)` for composite FKs. |
| `commitments` | `id`, `workspace_id`, `customer_id`, `created_by`, nullable `assigned_to`, title/category, `original_due_date`, `due_date`, decimal amount/currency, notes, status, completed fields, `row_version`, timestamps, `archived_at`. Add category/status checks and composite foreign keys that enforce customer and assignee membership in the same workspace. |
| `commitment_events` | append-only `id`, `workspace_id`, `commitment_id`, nullable actor for system events, typed event, `payload jsonb`, `created_at`, optional idempotency key. Add unique event/idempotency constraints. Never update/delete events through ordinary client APIs. |
| `workspace_settings` | workspace ID, default currency, date display preference, IANA timezone, reminder defaults, update timestamp. |
| `notifications` | recipient user, workspace, commitment, type, due/send time, `delivered_at`, `read_at`, idempotency key. Unique reminder key prevents duplicate notifications. |

Use `(workspace_id, due_date)` and `(workspace_id, customer_id)` indexes; partial indexes for active commitments and due reminders. Keep denormalized `customer_name_snapshot` on events where past names must remain historically accurate.

#### Migration/backfill procedure

1. Add tables and RLS without deleting `workspace_states`.
2. Write a transactionally safe migration function or trusted backfill command that reads each snapshot, creates the personal workspace, maps each customer/commitment/history ID, preserves original/current due dates and timestamps, and records a per-user migration receipt.
3. Make the backfill idempotent. A retry must neither duplicate commitments/events nor silently skip legitimate repeated promises. Use a stable `(source_user_id, source_id)` mapping table or deterministic mapping; do not dedupe commitments by title/date.
4. Validate per-account counts and checksums: customers, commitments, history events, settings, due-date nulls, amount totals, and completion status. Abort that user’s transaction if any required record fails.
5. Add a temporary read-compare mode in development: load snapshot and normalized result, compare normalized domain objects, then keep snapshot reads until all fixtures/backfill tests pass.
6. Switch reads/writes behind `CommitmentRepository`; keep a one-release export/rollback path. Do not dual-write indefinitely. Do not drop snapshots until every account is verified, a backup exists, and rollback has been tested.

#### RLS and write invariants

- Enable RLS on every exposed table and explicitly grant only needed operations to `authenticated`; no `anon` access to private ledger data.
- Implement workspace membership checks for every read/write, with roles enforced by operation. `owner` manages billing/account deletion and members; `admin` manages workspace members and records; `member` manages assigned/allowed records according to the product rules.
- Validate cross-table tenant consistency using composite FKs, triggers, or RPC checks: a commitment cannot point to another workspace’s customer or assignee; an event cannot refer to another workspace’s commitment.
- Create separate SELECT/INSERT/UPDATE/DELETE policies. Every update policy needs both `USING` and `WITH CHECK`; test policy behavior under actual `anon`, member, admin, and owner JWTs.
- Use narrow transactional RPCs for operations requiring state plus event atomicity: `create_commitment`, `update_commitment`, `transition_commitment_status`, `assign_commitment`, `record_progress`, and `archive_commitment`. Generate actor/timestamp server-side. Validate allowed transitions, workspace membership, and `expected_row_version`; append the event in the same transaction.
- Prefer `SECURITY INVOKER`. If a function must be `SECURITY DEFINER` to keep direct writes revoked or to perform a narrow privileged action, use `SET search_path = ''`, schema-qualify every object, derive identity from `auth.uid()`, check authorization inside the function, revoke execute from `PUBLIC`/`anon`, grant only to `authenticated`, and add positive/negative pgTAP cases.
- Events are append-only. Use database permissions and, if needed, a trigger to reject updates/deletes. Archiving or correcting a promise creates a new event; it does not erase the earlier event.

#### Supabase query patterns

Keep feature components away from direct Supabase calls; place these patterns in the repository layer. Always check `{ data, error }` and filter by the selected workspace as defense in depth; RLS remains mandatory.

```ts
// Stable, paginated open ledger. Use a deterministic tie-breaker.
const { data, error } = await supabase
  .from('commitments')
  .select('id,title,category,status,due_date,original_due_date,amount,currency,row_version,customers(id,name)')
  .eq('workspace_id', workspaceId)
  .in('status', ['Open', 'In progress'])
  .order('due_date', { ascending: true, nullsFirst: false })
  .order('id', { ascending: true })
  .range(from, to);
if (error) throw mapSupabaseError(error);
```

```ts
// Create state and its first audit event atomically; requestId makes retries safe.
const { data, error } = await supabase.rpc('create_commitment', {
  p_workspace_id: workspaceId,
  p_request_id: requestId,
  p_title: input.title,
  p_customer_id: input.customerId,
  p_category: input.category,
  p_due_date: input.dueDate || null,
  p_amount: input.amountDecimal,
  p_currency: input.currency,
});
if (error) throw mapSupabaseError(error);
```

```ts
// Audited edit with optimistic concurrency. The RPC changes the row and appends
// its event in one transaction. A stable request ID makes retries idempotent.
const { data, error } = await supabase.rpc('update_commitment', {
  p_workspace_id: workspaceId,
  p_commitment_id: commitmentId,
  p_expected_version: expectedVersion,
  p_request_id: requestId,
  p_patch: { title: input.title, due_date: input.dueDate || null },
});
if (error) throw mapSupabaseError(error);
if (!data) throw new ConflictError('Commitment changed or was removed.');
```

Do not perform a REST update followed by a separate REST event insert. Use `.select()` when returned rows are required; return rows are not implied on every mutation. Archive/delete only through an audited RPC scoped to workspace and record IDs. Add server-side exact counts/RPC summaries so client pagination does not produce false dashboard totals.

**Acceptance:** normalized data is fully backfilled and compared; two workspaces cannot cross-read or cross-link records; status/deadline updates and event inserts are atomic; stale edits return a typed conflict; event history cannot be rewritten by a normal client request.

### Phase 3 — Useful multi-user workspace features

#### Member roles and assignment

- Add a workspace switcher and membership screen: invite by email, list/remove members, set role, assign/unassign a commitment.
- Use an Edge Function for invitation flows that require Auth Admin APIs; hold any elevated key in Supabase secrets only. The browser sends its authenticated JWT; the function verifies the caller’s role before using admin capability.
- Show assignee and actor in the ledger and event timeline. Unassigned tasks remain visible to authorized members. Prevent assigning a user outside the workspace.
- Add member-removal behavior: keep historical actor IDs/snapshots, null or reassign active assignments transactionally, revoke access immediately.

#### Notifications and reminders

- Add per-user/workspace reminder preferences and a timezone. Support due-soon, due-today, and overdue reminders; do not schedule cancelled/completed commitments.
- Create idempotent `notifications` rows first. Schedule a server-side job/Edge Function to deliver email only after SMTP/provider configuration; never send reminders from a user's browser timer.
- Reconcile reminder rows when due date, status, assignee, timezone, or notification preferences change. Enforce a unique idempotency key so retries and cron overlap do not duplicate mail.
- Add an in-app inbox with unread state and links to the commitment. Respect quiet hours and daylight-saving transitions.

#### Fulfillment evidence

- Let members attach a URL or private file to a progress/completion event with an optional note. Require an explicit human action to mark evidence accepted; an attachment must never auto-complete a commitment.
- If using Storage, create a private bucket with upload/read/delete policies scoped to workspace membership and commitment ownership. Use paths like `{workspace_id}/{commitment_id}/{uuid}`; validate MIME type/size; never create a public bucket for customer documents. Store metadata and object path in Postgres, not a long-lived public URL.
- Use authenticated downloads or short-lived signed URLs and test that another workspace cannot list, read, overwrite, or delete the object.

#### Reporting and export

- Add workspace-scoped dashboard summaries: open, due today, overdue, completed this month, on-time completion rate, average days rescheduled, and promises by customer/assignee.
- Define whether cancelled records count in every metric. Calculate at the database/RPC layer with workspace scoping, indexes, stable local-date boundaries, and one consistent timezone rule.
- Add CSV export for commitments/history and calendar `.ics` export for active deadlines. Escape CSV formula prefixes (`=`, `+`, `-`, `@`) and never expose data to another workspace.

**Acceptance:** role matrix is tested with multiple users; members see only workspaces they belong to; assignment and member removal are auditable; reminders are idempotent across retries/time zones; evidence stays private and requires explicit acceptance; every report agrees with independently computed fixtures.

### Phase 4 — Product polish and operability

1. Split `src/App.tsx` into feature pages and shared components; keep feature state local and put domain logic in `src/domain` / application services.
2. Split `WorkspaceProvider.tsx` into AuthProvider, workspace selection/loading, repository adapters, and sync queue/error handling. Add typed state machines for loading, migration choice, synced, offline, and conflict instead of unrelated booleans.
3. Add URL routes/deep links for a commitment, customer profile, and notification; browser back/forward must work. Preserve mobile responsive behavior and focus management for modals.
4. Replace remaining magic colors/spacing with design tokens; establish a formatter and lint rules; enforce accessible labels, keyboard actions, reduced-motion support, and responsive tests.
5. Add product-help/onboarding: sample data is clearly optional; demo records cannot silently migrate; first-run users can start empty, import, or merge without destroying the source backup.
6. Add user-requested account export and account deletion. Export a consistent server snapshot; delete Auth users only from a trusted admin path after confirmation, and document retention/backup behavior. The client must never call an admin API with a secret key.
7. Add health/error monitoring with scrubbed metadata only. Never log email, contact details, notes, full SQL payloads, auth JWTs, or attachment URLs.

## Required test matrix

Add automated tests for every row before calling the corresponding phase complete:

| Area | Cases |
| --- | --- |
| Domain | Allowed/denied lifecycle transitions; completion/reopen/cancel; deadline reschedule and null; customer rename/merge; duplicate normalized names; currency precision; timezone/DST boundaries; malformed imported data. |
| Auth | No env; initial session; confirmation-required signup; password reset; expired/refresh failure; sign-out in another tab; account A to B; recovery URL; no cross-account flash. |
| Migration | Empty local/cloud; local only; cloud only; both; demo exclusion; malformed backup; duplicate IDs; customer ID remapping; retry after response loss; source remains unchanged. |
| Sync | Offline first load; cached pending write; latest cloud same as cache; different cloud revision; retry, reload, explicit overwrite; payload at/above limit; sign-out while write queued. |
| RLS | `anon`, non-member, member, admin, owner; select/insert/update/delete; forged workspace/customer/assignee IDs; RPC with missing auth; event update/delete attempt; Storage object path from another workspace. |
| UX/e2e | Signup/login/logout, empty state, create/edit/status/history, import/export, multi-user isolation, mobile layout, keyboard and screen-reader status messages. |
| Ops | Clean clone → install → local Supabase start/reset → pgTAP → unit tests → build; migration upgrade from the current snapshot fixture; backup then restore test. |

Use fictional fixtures only. Never use the owner’s production data or credentials in tests or CI.

## Definition of done for the roadmap

- Each phase has a separate reviewable commit and migration set.
- Current local mode and prior JSON backups remain usable or have an explicit migration path.
- No client-side secret/service-role key exists; `.env` remains ignored and `.env.example` contains placeholders only.
- Every exposed table/bucket has reviewed grants and RLS; cross-workspace tests deny access.
- State transitions and audit events are transactional and event history is append-only through normal client access.
- Auth, migration, offline/conflict, role, and feature flows have automated tests; CI is green.
- Setup, backup/restore, schema-migration, Auth redirect, email delivery, and account-deletion procedures are documented.
- Production rollout has a tested backup and rollback plan; the agent does not push a hosted migration without human approval.

## Official documentation references

Re-check documentation during implementation because Supabase APIs and platform configuration can change.

- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows) — config, migrations, seeds, reset and remote sync precautions.
- [Supabase database testing](https://supabase.com/docs/guides/database/testing) — pgTAP and RLS tests.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) — grants, policies, authenticated access, and test guidance.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions) — RPC, invoker/definer behavior, safe search paths, and function grants.
- [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react) — browser client and Auth flow.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) — publishable versus secret keys.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) — storage object RLS.
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) — private files and signed URLs.
- [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) — cron/Edge Function patterns and secure Vault secrets.
- [Supabase CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started) — local stack requirements and version pinning.
