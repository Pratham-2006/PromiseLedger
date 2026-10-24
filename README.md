# PromiseLedger

PromiseLedger is a local-first commitment ledger for small businesses, shopkeepers, freelancers, and independent service providers. Keep the original promise, its deadline, the person it was made to, and the changes that happened along the way in one place.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

The app runs in your browser and saves records in that browser's local storage. There is no account or backend. To create a production build, run `npm run build`.

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

Records stay in this browser's local storage. Clearing browser site data removes them. Use **Settings → Export backup** to save a portable JSON copy before moving browsers or devices. Importing a backup replaces local records only after confirmation.

Overdue and due-today indicators are derived from the user's local calendar date. A missing deadline remains missing and is not treated as overdue. When a deadline changes, the first promised date remains visible in the commitment history.

## Development

```sh
npm test
npm run build
```

The focused unit tests cover local date calculations, natural-language parsing, filtering, lifecycle history, and malformed data handling.

## MVP limitations

- Data is per-browser and does not sync across devices.
- The parser intentionally supports a small set of English date phrases and common sentence patterns; check its editable fields before saving.
- Currency preferences affect new entries and date display; no currency conversion or transaction processing is performed.
