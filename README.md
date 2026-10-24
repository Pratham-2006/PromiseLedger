# PromiseLedger

PromiseLedger is a local-first commitment ledger for small businesses, shopkeepers, freelancers, and independent service providers. Keep the original promise, its deadline, the person it was made to, and the changes that happened along the way in one place.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

Without Supabase configuration, the app runs in local-only mode and saves records in this browser. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured, PromiseLedger uses Supabase Auth and a private cloud workspace. To create a production build, run `npm run build`.

## Supabase setup

1. Copy `.env.example` to `.env` and enter your Supabase Project URL and publishable key. `.env` is ignored by Git. Never add a secret/service-role key to Vite variables.
2. In the Supabase Dashboard, open **SQL Editor**, paste and run [`supabase/migrations/20261024000000_create_workspace_states.sql`](supabase/migrations/20261024000000_create_workspace_states.sql). This creates the owner-only RLS policy and atomic, revision-checked save function.
3. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and allow that URL as a redirect. Add your deployed app URL before production use.
4. In **Authentication → Providers**, enable Email. If email confirmation is enabled, confirm the new account using the emailed link before signing in.
5. Restart `npm run dev`, create an account, and choose whether to import local records, merge them with a cloud workspace, or keep the existing cloud records.

Cloud records are stored as one versioned JSONB snapshot per authenticated account. That matches the app's existing aggregate database model and makes commitment history updates and imports atomic. RLS isolates each account, and an expected revision prevents silent cross-tab overwrites. A relational schema and granular multi-user sharing can be introduced later if reporting or collaboration requires it.

## What’s included

- Dashboard counts and a prioritized list for overdue, due-today, and near-term commitments.
- Create, edit, complete, cancel, reopen, and delete commitment records.
- Original and current deadlines with an event timeline for deadline changes, status changes, progress notes, completion, and reopening.
- Commitment search, status and category filters, due-date filters, and sorting.
- A lightweight customer directory with normalized name matching and per-customer history.
- Deterministic one-sentence capture for common verbs, names, INR amounts, and local-calendar dates. Extracted fields are editable before saving; unsupported phrases stay available for manual completion.
- Optional fictional shop records, labeled as demo data and removable without deleting user-created commitments.
- Currency and date display preferences, plus validated JSON backup export/import.
- Responsive desktop and mobile layouts.

## Data and privacy

In local-only mode, records stay in this browser's local storage. In cloud mode, records are private to the signed-in account; a user-scoped browser cache supports recovery if the network is temporarily unavailable. Use **Settings → Export backup** to save a portable JSON copy before switching devices or accounts. Importing a backup replaces the active workspace only after confirmation.

Overdue and due-today indicators are derived from the user's local calendar date. A missing deadline remains missing and is not treated as overdue. When a deadline changes, the first promised date remains visible in the commitment history.

## Development

```sh
npm test
npm run build
```

The focused unit tests cover local date calculations, natural-language parsing, filtering, lifecycle history, and malformed data handling.

## MVP limitations

- With Supabase configured, data syncs across devices after the database migration has been applied. Without it, data is per-browser.
- The parser intentionally supports a small set of English date phrases and common sentence patterns; check its editable fields before saving.
- Currency preferences affect new entries and date display; no currency conversion or transaction processing is performed.
