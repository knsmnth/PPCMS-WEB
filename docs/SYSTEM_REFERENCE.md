# PPOMS system and data reference

PPOMS is a client-side React Progressive Web App. Firebase Authentication supplies identity, Cloud Firestore is the shared server database, and IndexedDB provides local reads plus an offline write queue. There is no application server in this repository.

## Runtime stack

| Area | Implementation |
| --- | --- |
| UI | React 19, React Router 7, Vite 8 |
| PWA | `vite-plugin-pwa` and Workbox |
| Identity | Firebase Authentication with Google popup sign-in |
| Shared data | Cloud Firestore with real-time listeners |
| Local data | IndexedDB database `ppoms-offline-db`, schema version 7 |
| Offline writes | IndexedDB `syncQueue`, flushed in Firestore batches of at most 500 |
| Hosting | Static `dist/`; `netlify.toml` configures Netlify SPA routing and caching |
| Export files | JSON application backup plus project-level Excel exports |

## Request and synchronization flow

```text
React page
  | read
  v
useCollection() ---> IndexedDB object store ---> immediate UI state
  |                         ^
  | onSnapshot              | remote additions/modifications/removals
  v                         |
Cloud Firestore ------------+

React create/update/delete
  |-- writes IndexedDB immediately
  |-- appends operation to syncQueue
  '-- emits triggerSync
          |
          v
     useOfflineSync()
          |
          '-- Firestore batched set/delete when online
```

Remote data uses a last-write-wins guard based on the lexicographic value of `updatedAt`, falling back to `createdAt`. New code must keep those timestamps consistently comparable. Most records use ISO strings, while some older project fields use millisecond numbers; avoid mixing formats within the same timestamp field.

## Firestore and IndexedDB collections

Every application record uses its own `id` field and stores the same value as its Firestore document ID.

| Collection/store | Purpose and main relationship | Local index |
| --- | --- | --- |
| `users` | Authorization registry keyed by lowercase email; Firestore only | none |
| `campuses` | Top-level organizational/site records | primary key `id` |
| `facilities` | Buildings/facilities; `campusId` points to `campuses` | `campusId` |
| `projects` | Projects; `facilityId` points to `facilities` | `facilityId` |
| `schedulesOfWork` | Hierarchical work items; `projectId` points to `projects`, `parentId` forms the tree | `projectId` |
| `scheduleSummaries` | Cost groups; `scheduleOfWorkId` points to `schedulesOfWork` | `scheduleOfWorkId` |
| `summaryItems` | Material/labor/bulk line items; `summaryId` points to `scheduleSummaries` | `summaryId` |
| `materials` | Public-readable material catalogue and price history | primary key `id` |
| `laborTypes` | Public-readable labor catalogue and rate history | primary key `id` |
| `workGroupTemplates` | Reusable cost-group definitions | primary key `id` |
| `workGroupTemplateItems` | Template line items; `templateId` points to `workGroupTemplates` | `templateId` |
| `scheduleTemplates` | Reusable schedule definitions | primary key `id` |
| `scheduleTemplateWorks` | Template work hierarchy; `templateId` and `parentId` | `templateId` |
| `scheduleTemplateWorkGroups` | Join records from template work to work-group template; `scheduleTemplateWorkId` | `scheduleTemplateWorkId` |
| `signatures` | Configurable names, roles, ordering, and enabled state for print outputs | primary key `id` |
| `syncQueue` | Local-only pending create/update/delete operations | `collection` |

The rules also retain public-read support for a legacy `equipments` collection. The current UI, IndexedDB schema, backup service, and API Integrations page do not manage or expose equipment records. Treat it as a compatibility endpoint, not an active PPOMS feature, unless equipment support is implemented end to end.

## Authorization model

| Actor | Public master data | Operational collections | Own user record | All user records / role management |
| --- | --- | --- | --- | --- |
| Not signed in | read | denied | denied | denied |
| Signed in without a role | read | denied | no document to read | denied |
| `admin` | read/write | read/write | read; update profile metadata only | denied |
| `super_admin` | read/write | read/write | read; update profile metadata only | list/create/update/delete other users |

Public master data currently means `materials`, `laborTypes`, and the legacy `equipments` path. If an organization does not require anonymous REST integration, change these reads to `hasActiveRole()` and update the API Integrations page and documentation in the same commit.

The first super-admin is seeded outside the client. This removes a race in which the first visitor to a fresh Firebase project could promote themselves.

## Query and index reference

Current Firestore reads use:

- unfiltered collection reads with `limit`;
- one `where(field, '==', value)` constraint for parent-child pages;
- one `where(field, 'in', ids)` constraint for scoped downloads, chunked to 30 IDs;
- document reads by ID for authorization.

No current query combines multiple fields or adds `orderBy`, so no composite Firestore index is required. `firestore.indexes.json` is intentionally empty. IndexedDB has explicit relationship indexes because browser-side filtering uses them.

Real-time page listeners default to 100 documents. The Data Management **Download from Firestore** workflow paginates in groups of 500 and is the correct way to hydrate a complete local backup before migration.

## Important source files

| File | Responsibility |
| --- | --- |
| `src/main.jsx` | React entry point |
| `src/App.jsx` | Authenticated route tree and global sync hooks |
| `src/lib/firebase.js` | Firebase Web app, Firestore, Auth, provider, optional Analytics |
| `src/hooks/useAuth.js` | Google sign-in, role lookup, profile refresh, offline role cache |
| `src/hooks/useData.js` | IndexedDB-first collection reads, Firestore listeners, queued CRUD |
| `src/hooks/useOfflineSync.js` | Flushes queued writes to Firestore |
| `src/hooks/useCollisionResolver.js` | Repairs project/work-code collisions after concurrent offline work |
| `src/lib/db.js` | IndexedDB schema and helpers |
| `src/lib/dataManager.js` | JSON backup/restore and scoped Firestore upload/download/delete |
| `src/lib/cascade.js` | Hierarchical clone and delete operations |
| `src/lib/billing.js` | Bottom-up cost recomputation |
| `firestore.rules` | Server-enforced authorization policy |
| `firestore.indexes.json` | Deployable composite index and field-override manifest |
| `firebase.json` | Firebase deploy and emulator configuration |
| `tests/firestore.rules.test.mjs` | Executable authorization contract |

## Operational constraints

### Browser data is environment-sensitive

The IndexedDB name does not include the Firebase project ID. Using the same origin/browser profile after changing `.env.local` can mix old cached records or queued writes with the new project. Clear site data or use separate browser profiles when switching environments.

### Offline authorization is cached

After a successful online login, the role is stored in local storage for offline startup. Revoking a user in Firestore does not erase an already cached offline role on that device. Server writes remain blocked after revocation, but previously cached data can still be viewed offline. For sensitive deployments, add a device/session revocation policy or remove the offline role fallback.

### Client batches are not a transaction across batches

Large sync queues are split into multiple Firestore batches and committed in parallel. One batch can succeed while another fails. The queue is cleared only after all promises succeed, so a retry may safely merge completed `set` writes and repeat deletes, but observers may see partial progress during the attempt.

### Cascades happen in the client

Firestore does not enforce referential integrity. Parent deletes and total recomputations depend on application code. Administrative imports that bypass PPOMS must preserve IDs and relationship fields.

### Public data is genuinely public

Anonymous Firestore REST callers can read master-data documents because the rules explicitly allow it. The Firebase Web API key is not the access-control boundary. Review this policy before deploying data that should not be public.

## Handoff checklist

- Read [Set up PPOMS](SETUP.md) before running the application against a new project.
- Use [the Firebase migration guide](FIREBASE_MIGRATION.md) for project-to-project data moves.
- Run `npm run build` and `npm run test:rules` before deploying.
- Deploy Firestore with an explicit `--project` target.
- Keep `.env.local` and `.firebaserc` out of transferred archives and Git history.
- Update this reference whenever a collection, relationship, role, public endpoint, or query shape changes.

## Known verification baseline

- `npm run build` passes. Vite reports a large main chunk (about 1.96 MB before gzip) and an ineffective dynamic import for `billing.js`; these are performance warnings, not setup blockers.
- The full `npm run lint` currently fails on pre-existing generated `dev-dist` files and application issues such as unused variables and React hook/compiler rules. Linting the files changed by the Firebase handoff passes. Do not treat the repository-wide lint command as a green CI gate until that existing backlog is fixed.
- Firebase CLI 15 requires Java 21 or newer for the Firestore emulator. A Java 17 installation can build the web app but cannot run `npm run test:rules`.
