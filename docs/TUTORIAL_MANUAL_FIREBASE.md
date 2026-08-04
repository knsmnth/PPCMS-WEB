# Create a PPOMS Firebase project manually

This tutorial creates a fresh Firebase backend through the Firebase Console, connects PPOMS through `.env.local`, publishes the repository's Firestore rules, confirms the required index state, and creates the first super-admin. By the end, you can sign in and create a record in an entirely separate Firebase project.

This is the shortest setup path for a programmer who received the PPOMS source code and does not need to migrate existing data. For a full development-machine setup, use [Set up PPOMS from a clean machine](SETUP.md). For an existing database move, use [the Firebase migration guide](FIREBASE_MIGRATION.md).

## What you need

- The PPOMS repository.
- A Google account that can create a Firebase project.
- Node.js 22.12 or newer and npm.
- The lowercase Google email address that will become the first PPOMS `super_admin`.
- About 15 minutes.

Java is not required for this console-only path. Java 21 or newer is required only when running the automated Firestore rule tests.

## Step 1: Create the Firebase project

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select **Create a project**.
3. Enter a recognizable project name, such as `PPOMS Development` or `PPOMS Production`.
4. Review the generated project ID. Edit it now if necessary; Firebase project IDs cannot be changed after creation.
5. Continue through the prompts. Google Analytics is optional for PPOMS.

When creation finishes, Firebase opens the Project Overview page. Record the exact project ID because you will use it to verify `.env.local`.

## Step 2: Register the PPOMS Web app

1. On Project Overview, select the **Web** icon (`</>`). If another app is already registered, select **Add app**, then **Web**.
2. Enter an app nickname such as `PPOMS Web`.
3. Firebase Hosting registration is optional. The repository is already configured for Netlify, but it can also be hosted elsewhere as static files.
4. Select **Register app**.
5. In the SDK setup screen, choose the **Config** view and keep the displayed `firebaseConfig` object open.

You should see values shaped like this:

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..." // only when Analytics is enabled
};
```

Do not paste this JavaScript object into the PPOMS source code. The next step maps its values into the environment file.

## Step 3: Connect PPOMS through `.env.local`

Install the project and copy the committed environment template.

PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
```

macOS or Linux:

```bash
npm ci
cp .env.example .env.local
```

Open `.env.local` and replace every placeholder using the Web app configuration from Step 2:

```dotenv
VITE_FIREBASE_API_KEY=PASTE_apiKey_HERE
VITE_FIREBASE_AUTH_DOMAIN=PASTE_authDomain_HERE
VITE_FIREBASE_PROJECT_ID=PASTE_projectId_HERE
VITE_FIREBASE_STORAGE_BUCKET=PASTE_storageBucket_HERE
VITE_FIREBASE_MESSAGING_SENDER_ID=PASTE_messagingSenderId_HERE
VITE_FIREBASE_APP_ID=PASTE_appId_HERE
VITE_FIREBASE_MEASUREMENT_ID=PASTE_measurementId_HERE_OR_LEAVE_BLANK
```

Use the exact `storageBucket` value Firebase displays. Depending on when the project was created, its domain may differ from the placeholder in `.env.example`.

Rules for the file:

- Do not wrap values in quotes.
- Do not add commas or the `const firebaseConfig =` line.
- Leave `VITE_FIREBASE_MEASUREMENT_ID=` blank if the config object has no `measurementId`.
- Confirm `VITE_FIREBASE_PROJECT_ID` is the new project, not the original PPOMS project.
- Never commit `.env.local`. The repository ignores `*.local` files.

Run the frontend:

```bash
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. At this point the PPOMS login screen should render. Sign-in will not work until Google Authentication is enabled in the next step.

## Step 4: Enable Google sign-in

1. In the Firebase Console, open **Authentication**.
2. Select **Get started** if Authentication has not been initialized.
3. Open **Sign-in method**, add or select **Google**, and enable it.
4. Choose the required project support email and save.
5. Open **Authentication > Settings > Authorized domains**.
6. Add `localhost` for local development if it is not present.
7. When the frontend is deployed, add its exact hostname, such as `your-site.netlify.app` or the production custom domain.

New Firebase projects do not automatically authorize `localhost`, so check this even when local sign-in worked in older projects. Do not keep `localhost` authorized in a production-only Firebase project unless the team explicitly needs it.

## Step 5: Create the Firestore database

1. In the Firebase Console, open **Firestore Database**.
2. Select **Create database**.
3. Choose the Standard/Native Firestore option if the console asks for an edition or mode.
4. Keep the database ID as `(default)`.
5. Choose the database region closest to the application's users and aligned with organizational data-location requirements. Treat this choice as permanent for this project.
6. Select **Production mode** if prompted. The temporary starting rules do not matter because you will replace them in the next step.

When creation finishes, the **Data**, **Rules**, and **Indexes** tabs should be visible.

## Step 6: Publish the PPOMS Firestore rules manually

The repository's [firestore.rules](../firestore.rules) file is the security source of truth. Always copy the entire file; do not merge it with Firebase's temporary starter rules.

Copy it to the clipboard.

PowerShell:

```powershell
Get-Content -Raw .\firestore.rules | Set-Clipboard
```

macOS:

```bash
pbcopy < firestore.rules
```

Then publish it:

1. In **Firestore Database**, open the **Rules** tab.
2. Select all existing editor content and replace it with the complete contents of `firestore.rules`.
3. Confirm the first line is `rules_version = '2';`.
4. Select **Publish**.
5. Wait for the console to confirm that the rules were published.

These rules make `materials`, `laborTypes`, and the legacy `equipments` path publicly readable for external integrations. All writes and all operational collections require a PPOMS role. Review [the authorization reference](SYSTEM_REFERENCE.md#authorization-model) before putting confidential master data in these collections.

### Recommended repeatable alternative

Manual pasting works for a first setup. For later updates, deploy the committed rules and index manifest together so the console cannot drift from Git:

```bash
npm exec firebase -- login
npm exec firebase -- deploy --only firestore --project YOUR_FIREBASE_PROJECT_ID
```

Always replace `YOUR_FIREBASE_PROJECT_ID` with the value in `.env.local` and confirm the CLI target before approving deployment.

## Step 7: Confirm the Firestore indexes

Open [firestore.indexes.json](../firestore.indexes.json). Its current contents are:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

This is intentional. PPOMS currently uses unfiltered reads, document-ID reads, and one equality or `in` filter at a time. A new Firestore database automatically creates the single-field indexes required for those queries.

For the current codebase:

1. Open **Firestore Database > Indexes**.
2. Do not add a composite index.
3. Do not disable automatic indexing or create field exemptions.
4. Continue to Step 8.

The Firebase Console does not provide a box where this JSON file can be pasted. If `firestore.indexes.json` gains entries in a future version, use the Firebase CLI deployment from Step 6, or manually create each listed composite index under **Indexes > Add Index**. Any console-created index must also be added to `firestore.indexes.json` so another Firebase project can reproduce it.

If the application later reports that a query needs an index, Firestore includes a link that pre-fills the required index. Review the fields, create it, wait until its status is **Enabled**, export or copy its definition into `firestore.indexes.json`, and commit that change.

## Step 8: Create the first super-admin manually

PPOMS does not automatically promote the first visitor. You must create one role record before the first successful sign-in.

1. Open **Firestore Database > Data**.
2. Select **Start collection**.
3. Set the collection ID to `users`.
4. Set the document ID to the administrator's complete Google email address in lowercase, for example `administrator@example.edu`.
5. Add these fields:

| Field | Firestore type | Value |
| --- | --- | --- |
| `email` | string | the same lowercase email used as the document ID |
| `role` | string | `super_admin` |
| `createdAt` | string | current time in ISO 8601 format, such as `2026-08-04T00:00:00.000Z` |

6. Save the document.

Do not create `createdAt` as a Firestore Timestamp for this seed record; the current application stores its audit times as ISO strings. After the administrator signs in, PPOMS safely adds `uid`, `displayName`, `photoURL`, and `lastLogin`.

## Step 9: Sign in and verify the new project

Restart Vite if it was running while `.env.local` changed:

```bash
npm run dev
```

Use this checklist:

1. Sign in with the exact Google email seeded in Step 8.
2. Confirm the Dashboard opens and **Access Management** is visible.
3. Create a temporary campus.
4. In **Firestore Database > Data > campuses**, confirm the campus document appears.
5. Refresh PPOMS and confirm the campus remains.
6. In Access Management, add a temporary `admin` email.
7. Confirm that admin can use operational pages but cannot open Access Management.
8. Delete disposable test records after verification.

You now have a working PPOMS installation using a manually created, separate Firebase project.

## Troubleshooting

### The app opens but Google sign-in says `auth/unauthorized-domain`

Add `localhost` or the deployed frontend hostname under **Authentication > Settings > Authorized domains**. Enter only the hostname, without `https://` or a path.

### Firebase reports `auth/configuration-not-found` or the popup closes immediately

Confirm Google is enabled under **Authentication > Sign-in method** and that a support email is selected.

### PPOMS shows Access Denied after Google sign-in

Check all of the following:

- The `users` document ID exactly matches the signed-in email in lowercase.
- Its `email` field contains the same lowercase value.
- Its `role` field is exactly `super_admin` or `admin`.
- `.env.local` points to the Firebase project containing that document.
- The complete repository rules were published successfully.

### The app displays old data from another Firebase project

PPOMS uses the same IndexedDB database name in every environment. Use a clean browser profile, or export any needed local records and clear site storage before switching Firebase projects. Otherwise, old cached data or queued writes can appear in the new environment.

### Rules were edited in the console later

Copy the reviewed change back into `firestore.rules`, run `npm run test:rules` with Java 21 or newer, and commit it. A future CLI deployment overwrites console rules with the repository file.

### A future query asks for a composite index

Follow the generated Firebase link, verify the collection and fields, create the index, and wait for **Enabled** status. Then add the same definition to `firestore.indexes.json`; do not leave the only copy in one Firebase Console.

## What you built

You created a Firebase project, registered a PPOMS Web app, configured `.env.local`, enabled Google Authentication, created the default Firestore database, published the reviewed rules, confirmed that no composite indexes are currently required, seeded the first super-admin, and verified a real write from PPOMS. The project is now independent from the original Firebase environment and ready for application-data migration or deployment.

