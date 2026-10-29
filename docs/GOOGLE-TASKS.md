# Google Tasks integration

Google Tasks is an opt-in Dashboard widget. It reads lists, creates top-level
tasks with an optional date, and completes/reopens existing tasks. It does not
copy tasks into outline bullets or participate in note conflict handling.

## Setup — staging only

Use Google Cloud project `remonook-staging`, not the production project.

1. Enable **Google Tasks API** in APIs & Services → Library.
2. In Google Auth Platform, configure branding, an External audience in Testing
   mode, and authorized test-user emails. Add the
   `https://www.googleapis.com/auth/tasks` scope in Data Access.
3. Create a dedicated **Web application** OAuth client, named
   **RemoNook Tasks — Staging**. Do not replace the Firebase sign-in client.
4. Add this exact authorized redirect URI:
   `https://remo-sync-staging.remo-978fb.workers.dev/integrations/google-tasks/callback`.
5. On Cloudflare Worker **remo-sync-staging**, add secrets named
   `GOOGLE_TASKS_CLIENT_ID` and `GOOGLE_TASKS_CLIENT_SECRET`. Never put values in
   source files, screenshots, logs, chat, or frontend environment variables.
6. Configure `GOOGLE_TASKS_REDIRECT_URI` as above and install a cryptographically
   generated 32-byte base64url secret `GOOGLE_TASKS_ENCRYPTION_KEY`. Keep the key
   stable; replacing it without re-encrypting stored data requires reconnection.
7. Apply the additive `cloud/google-tasks.sql` migration only to staging D1
   `8343200b-cb13-4d6a-a165-d6881873e306`. Existing tables/data are retained.
8. Bundle and deploy `cloud/worker.mjs` with the bindings in
   `cloud/config.staging.example.json`. Preserve existing secrets and D1/R2
   bindings. Disable invocation logging and redact query strings: OAuth callback
   URLs contain short-lived authorization codes. Deploy the backend before the
   matching frontend.
9. Sign in to staging as a configured test user. Add the widget; test connection,
   reload, adding a task, completing/reopening, and disconnecting. Check that
   another signed-in device sees the connection and that ordinary note sync
   continues. Real Google consent cannot be validated by mocked API tests.

An External OAuth application in Testing can have expiring refresh tokens
(typically seven days for these scopes). The app shows Reconnect when access is
revoked or expires. Complete Google's required consent verification before a
public production rollout; Testing is intended for the staging test audience.

Until all OAuth bindings exist, the backend advertises
`googleTasksConfigured:false` in `/health`. The widget explains that setup is
pending and disables Connect. There is no demo data pretending to be live tasks.

## Data and security

The existing Firebase ID token authenticates all private integration endpoints.
Google authorization is a separate authorization-code flow with PKCE, OIDC nonce,
expiring one-use state, and a Secure/HttpOnly/SameSite=Lax popup cookie. Callback
success also needs a one-use proof delivered to the original opener and an
authenticated finish request. Browser messages require the exact backend origin,
popup window, and connection state. No Google credential reaches browser storage.

Credentials are AES-GCM encrypted with user/version-associated data in separate
D1 tables. They are excluded from workspaces, CRDT journals and user backups.
Opaque connection versions guard requests; disconnect tombstones the current
version before attempting Google revocation. Disconnect always clears local
access, and reports if the user must finish revocation in Google Account settings.

Task data is transient in the browser and shared across widget instances. Google
responses use field masks so unused task notes are not fetched. A task-create
receipt retains a request hash and returned ID, not task text. Ambiguous creates
are not automatically replayed. Expired OAuth handoffs and create receipts older
than seven days are cleaned on the user's status checks and daily at 03:17 UTC. Configure the
Worker cron from the checked-in staging configuration; this maintenance job
never reads or changes note records.

The widget refreshes when opened or the tab returns, and on explicit Refresh.
There is no continuous polling and no offline write queue. Task changes are shown
as successful only after Google accepts them. Failed submissions retain drafts;
Google Tasks does not change RemoNook's normal save delay or sync outbox.

## Endpoints

Under `/integrations/google-tasks`:

- Public GET `/authorize`, `/callback` handle only the short-lived OAuth handoff.
- Authenticated GET `/status`, `/lists`, `/tasks` return status and paginated data.
- Authenticated POST `/connect`, `/finish`, `/disconnect` manage authorization.
- Authenticated POST `/create`, `/complete` perform supported task mutations.

Only configured frontend origins are allowed. The connection's Google account
can differ from the RemoNook sign-in account and is labeled in the UI. Source list
preferences use the normal workspace settings path; they carry no credentials.

## Validation

Run `npm test` and `npm run build`. Dedicated regressions are
`tests/google-tasks.test.mjs` and `tests/google-tasks-widget.test.mjs`. Test against
synthetic Google lists for staging acceptance; never use production data for the
staging migration or backend deployment.
