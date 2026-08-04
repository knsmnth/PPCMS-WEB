# Set up PPOMS from a clean machine

This guide takes a new maintainer from a fresh clone to a working PPOMS installation backed by a new Firebase project. Follow the steps in order. The result is a local development build, tested Firestore rules, a seeded super-admin, and a production-ready environment configuration.

## What you need

- Git.
- Node.js 22.12 or newer. The repository includes `.nvmrc`; Vite also supports Node 20.19 or newer.
- npm 10 or newer.
- Java 21 or newer for the Firestore emulator and security-rule tests.
- A Google account allowed to create or administer Firebase projects.
- A modern Chromium, Firefox, or Safari browser with IndexedDB enabled.
- Optional: a Netlify account for the production frontend.

The Firebase CLI and rule-testing library are project dependencies. Do not install a separate global CLI unless you need it for other repositories.

## Step 1: Install the project

From the repository root:

```bash
npm ci
npm run build
```

`npm ci` installs the versions locked in `package-lock.json`. The build should complete and create `dist/`.

## Step 2: Create the Firebase project

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project for this PPOMS environment.
2. Create the default Cloud Firestore database in Native mode. Choose the region deliberately; moving an existing database to another region requires a data migration.
3. Add a Web app under **Project settings > General > Your apps**.
4. Under **Authentication > Sign-in method**, enable Google sign-in and set the support email.
5. Under **Authentication > Settings > Authorized domains**, keep `localhost` for development and add every deployed frontend hostname, such as `your-site.netlify.app` and the production custom domain.
6. Google Analytics is optional. PPOMS initializes Analytics only when a measurement ID is configured.

The application uses Firebase Authentication and Cloud Firestore. It does not currently upload files to Firebase Storage or run Cloud Functions.

## Step 3: Create the local environment file

Copy `.env.example` to `.env.local`, then paste the Firebase Web app configuration values from **Project settings > General**.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS or Linux:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Firebase Web config field |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId`, optional |

Firebase Web API keys identify the Firebase project; they are not authorization secrets. Firestore Security Rules enforce data access. Keep `.env.local` uncommitted anyway so a clone cannot silently point at the wrong environment. See [Firebase's API-key guidance](https://firebase.google.com/docs/projects/api-keys).

Restart Vite after changing any `VITE_` variable.

## Step 4: Bind the clone to its Firebase project

Authenticate and add local aliases:

```bash
npm exec firebase -- login
npm exec firebase -- use --add
```

Recommended aliases are `dev` and `prod`. Firebase writes them to `.firebaserc`, which this transferable repository intentionally ignores. `.firebaserc.example` documents the expected shape.

Do not run `firebase init`; the reviewed configuration is already committed in `firebase.json`, `firestore.rules`, and `firestore.indexes.json`.

Confirm the target before every deployment:

```bash
npm exec firebase -- use
```

## Step 5: Test and deploy Firestore configuration

Run the security-rule suite locally:

```bash
npm run test:rules
```

The emulator must be able to start Java. The tests verify public master-data reads, default-deny behavior, admin access, super-admin-only role management, and self-profile restrictions.

Deploy both rules and indexes to the intended project:

```bash
npm exec firebase -- deploy --only firestore --project YOUR_FIREBASE_PROJECT_ID
```

The explicit `--project` value is a safety check against deploying to an old or unrelated environment. A Firestore deployment overwrites console-managed rules, so treat the committed files as the source of truth. See the [Firebase CLI reference](https://firebase.google.com/docs/cli).

`firestore.indexes.json` currently has no composite indexes because every application query uses a single equality/`in` filter or an unfiltered collection read. Firestore's automatic single-field indexes cover those queries. If a future query returns a missing-index link, add the generated definition to this file, review it, deploy it, and commit it.

## Step 6: Seed the first super-admin

PPOMS deliberately does not promote the first person who signs in. Client-side first-user promotion lets an arbitrary visitor claim a fresh deployment.

Before the first login, create this document in **Firestore Database > Data**:

- Collection: `users`
- Document ID: the administrator's full email address in lowercase
- Fields:

| Field | Type | Value |
| --- | --- | --- |
| `email` | string | the same lowercase email address |
| `role` | string | `super_admin` |
| `createdAt` | string | an ISO 8601 timestamp, for example `2026-08-04T00:00:00.000Z` |

Do not include spaces in the document ID. The email must match the Google account exactly after lowercasing.

When this user signs in, PPOMS fills `uid`, `displayName`, `photoURL`, and `lastLogin`. The super-admin can then add other `admin` or `super_admin` users from **Access Management**.

## Step 7: Run and verify locally

```bash
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

Verify all of the following:

1. Google sign-in completes without an `auth/unauthorized-domain` error.
2. The seeded user reaches the Dashboard and sees **Access Management**.
3. Create a test campus while online. Refresh the page and confirm it remains.
4. In the Firebase console, confirm the document exists in `campuses`.
5. In Access Management, add a test `admin`; confirm that account can use operational pages but cannot open Access Management.
6. Sign out, disable the network in browser developer tools, and confirm previously cached data remains readable.

## Step 8: Configure Netlify

The committed `netlify.toml` builds with `npm run build`, publishes `dist/`, provides the SPA redirect, and sets safe PWA cache headers.

1. Create a Netlify site from the repository.
2. Add every variable from `.env.local` under **Site configuration > Environment variables**.
3. Deploy the site.
4. Add the Netlify hostname and custom domain to Firebase Authentication's authorized domains.
5. Run the production verification checklist from Step 7.

Never reuse a development Firebase project for production. Use separate projects and separate Netlify environment values.

## Daily commands

| Task | Command |
| --- | --- |
| Start Vite | `npm run dev` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| Preview production build | `npm run preview` |
| Start Firestore emulator | `npm run firebase:emulators` |
| Test Firestore rules | `npm run test:rules` |
| Deploy active project's Firestore config | `npm run firebase:deploy` |
| Deploy an explicit target | `npm exec firebase -- deploy --only firestore --project PROJECT_ID` |

## Troubleshooting

### `Missing or insufficient permissions`

- Confirm the signed-in email has a lowercase `users/{email}` document.
- Confirm `role` is exactly `admin` or `super_admin`.
- Confirm the frontend's `VITE_FIREBASE_PROJECT_ID` matches the project where the rules and user document were deployed.
- Run `npm exec firebase -- use` and redeploy with an explicit project ID.

### Google reports `auth/unauthorized-domain`

Add the exact frontend hostname under **Authentication > Settings > Authorized domains**. Do not include the URL scheme or a path.

### The app shows data from a different Firebase project

IndexedDB uses the fixed browser database name `ppoms-offline-db`. Before switching a browser between Firebase projects, export needed data and clear that site's storage, or use a separate browser profile. Otherwise, cached records or queued offline writes from one environment can appear in another.

### Rules tests cannot start

Run `java --version`. Install Java 21 or newer, make sure `JAVA_HOME` and `PATH` point to that installation, close the terminal, and rerun `npm run test:rules`.

### Firestore asks for an index

Open the error's generated index link, verify the fields match an intentional query, then add the equivalent entry to `firestore.indexes.json`. Never create production-only indexes without updating the repository manifest.

## Next documents

- [Firebase migration guide](FIREBASE_MIGRATION.md)
- [System and data reference](SYSTEM_REFERENCE.md)

