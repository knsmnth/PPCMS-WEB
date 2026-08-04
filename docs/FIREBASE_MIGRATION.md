# How to migrate PPOMS to another Firebase project

This guide moves PPOMS configuration and data to a separate Firebase project without binding the transferred repository to the original environment.

## Choose a data-migration method

| Method | Best for | Moves | Does not move | Cost and tooling |
| --- | --- | --- | --- | --- |
| PPOMS JSON handoff | Small-to-medium datasets or projects without billing | All 14 application collections handled by IndexedDB | `users`, Authentication configuration, rules, indexes | Uses the PPOMS UI; no Blaze plan required |
| Managed Firestore export/import | Full production migration or large datasets | All selected Firestore collections, including `users` | Firebase Auth provider settings, Web app config, rules, index definitions | Requires billing, `gcloud`, Cloud Storage, and IAM |

For either method, deploy the repository's Firestore configuration and configure Firebase Authentication separately. Firestore exports do not contain index definitions. See Firebase's [move-data guide](https://firebase.google.com/docs/firestore/manage-data/move-data) and [export/import reference](https://firebase.google.com/docs/firestore/manage-data/export-import).

## Before the migration

1. Schedule a maintenance window and stop users from writing during the final copy.
2. Record the source and destination Firebase project IDs.
3. Create the destination project using Steps 2 through 5 of [the setup guide](SETUP.md), or follow [the manual Firebase project tutorial](TUTORIAL_MANUAL_FIREBASE.md).
4. Deploy `firestore.rules` and `firestore.indexes.json` to the destination.
5. Keep source and destination `.env.local` files outside Git. Label them clearly.
6. Use separate browser profiles for source and destination. PPOMS uses the same IndexedDB name in every environment.
7. Take a recoverable source backup before importing anything.

## Method A: Migrate through the PPOMS JSON backup

This method uses the application's **Data Management** page. Only a `super_admin` can open it.

### 1. Capture a complete source snapshot

In a clean browser profile connected to the source Firebase project:

1. Sign in as a source super-admin.
2. Open **Data Management**.
3. Set scope to **Everything**.
4. Run **Download from Firestore**. This fills local IndexedDB with every server document instead of relying on page listeners, which load at most 100 documents per collection.
5. Run **Export Backup** and save the generated `ppoms-backup-all-YYYY-MM-DD.json` file in protected storage.
6. Keep the source project read-only until destination verification finishes.

The JSON contains these application collections: `campuses`, `facilities`, `projects`, `schedulesOfWork`, `scheduleSummaries`, `summaryItems`, `materials`, `laborTypes`, `workGroupTemplates`, `workGroupTemplateItems`, `scheduleTemplates`, `scheduleTemplateWorks`, `scheduleTemplateWorkGroups`, and `signatures`. It does not contain `users`.

### 2. Prepare destination access

Seed the first destination super-admin exactly as described in [Set up PPOMS](SETUP.md#step-6-seed-the-first-super-admin). Configure the frontend with the destination Firebase Web app values and sign in from a separate clean browser profile.

### 3. Restore and upload

1. Open **Data Management** in the destination.
2. Choose **Restore / Replace All Local Data** and select the JSON backup. This replaces local IndexedDB only; it does not write Firestore yet.
3. Keep scope set to **Everything**.
4. Run **Upload to Firestore**. PPOMS uploads in batches of 450 and preserves document IDs.
5. Wait for completion before closing the tab or changing networks.
6. Recreate other user access records from **Access Management**.

### 4. Verify the JSON migration

- Compare per-collection counts on source and destination.
- Open at least one campus, facility, project, schedule, cost summary, work-group template, schedule template, and signature.
- Confirm calculated project totals match.
- Create, update, and delete a disposable destination record.
- Confirm a public unauthenticated GET works for `materials` and `laborTypes` if public integration is still required.
- Confirm a normal `admin` cannot list or modify `users`.

## Method B: Use managed Firestore export/import

Managed migration is the safer choice for large production databases because the service copies Firestore data directly rather than routing it through one browser. Both projects must have billing enabled.

### 1. Create the export bucket

Create a Cloud Storage bucket in or near the source Firestore region. Use a dedicated prefix for the migration.

```bash
gcloud storage buckets create gs://YOUR_MIGRATION_BUCKET \
  --project=SOURCE_PROJECT_ID \
  --location=SOURCE_FIRESTORE_REGION
```

### 2. Export the source database

```bash
gcloud firestore export gs://YOUR_MIGRATION_BUCKET/ppoms-YYYYMMDD \
  --project=SOURCE_PROJECT_ID \
  --database='(default)'
```

Wait for the operation to complete. Do not import a partial export.

### 3. Grant the destination service agent bucket access

Find the destination project number:

```bash
gcloud projects describe DESTINATION_PROJECT_ID --format='value(projectNumber)'
```

Grant the resulting Firestore service agent access to the migration bucket:

```bash
gcloud storage buckets add-iam-policy-binding gs://YOUR_MIGRATION_BUCKET \
  --member='serviceAccount:service-DESTINATION_PROJECT_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com' \
  --role='roles/storage.admin'
```

Remove this cross-project grant after the migration and rollback window end.

### 4. Import into the destination

Deploy the destination indexes first, then import:

```bash
npm exec firebase -- deploy --only firestore --project DESTINATION_PROJECT_ID

gcloud firestore import gs://YOUR_MIGRATION_BUCKET/ppoms-YYYYMMDD \
  --project=DESTINATION_PROJECT_ID \
  --database='(default)'
```

An import preserves document IDs and overwrites documents with the same IDs; unrelated destination documents remain. Imports do not trigger Cloud Functions, but active snapshot listeners receive updates.

### 5. Reconfigure Firebase Authentication

Firestore `users` documents migrate, but Firebase Authentication configuration does not.

1. Enable Google sign-in in the destination.
2. Add development and production authorized domains.
3. Update frontend environment variables to the destination Web app.
4. Ask users to sign in again. Firebase Auth UIDs are project-specific; PPOMS refreshes each user's `uid`, display name, photo URL, and last-login fields after successful sign-in.

## Rules and index migration policy

The repository is the source of truth:

- `firebase.json` maps deployable Firestore files and emulator ports.
- `firestore.rules` contains role-based access and the explicit collection allowlist.
- `firestore.indexes.json` contains all composite indexes and field overrides.
- `.firebaserc` is intentionally local so a transferred clone cannot deploy to the previous owner's project by accident.

The current index manifest is empty by design. Current queries use one equality/`in` filter at a time and need only automatic single-field indexes. If the source project contains console-created composite indexes added after this audit, review them before cutover and commit every still-required definition.

After any rule or index change:

```bash
npm run test:rules
npm exec firebase -- deploy --only firestore --project DESTINATION_PROJECT_ID
```

## Rollback

1. Do not delete or modify the source project during the verification window.
2. Keep the frontend deployment that points to the source project available for rollback.
3. If cutover fails, stop destination writes and restore the previous frontend environment/deployment.
4. Export any destination-only writes before retrying so they are not lost.
5. Diagnose the failed collection, rule, index, Auth domain, or environment binding before another cutover.

## Migration acceptance checklist

- [ ] Destination build uses only destination Firebase environment values.
- [ ] Google sign-in works on local and production hostnames.
- [ ] At least one `super_admin` can access Access Management and Data Management.
- [ ] Regular `admin` users can use operational data but cannot manage roles.
- [ ] Source and destination application collection counts match.
- [ ] Representative hierarchy, templates, summaries, totals, and signatures match.
- [ ] Public master-data access matches the organization's intended policy.
- [ ] `npm run test:rules` and `npm run build` pass; the known repository-wide lint baseline has been reviewed separately.
- [ ] Rules and index deployment used the explicit destination project ID.
- [ ] Cross-project bucket IAM is removed after the rollback window.
- [ ] The source project is retired only after written acceptance.
