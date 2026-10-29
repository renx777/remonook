# Email and password accounts

RemoNook supports Google and email/password through the same Firebase project
and account-scoped workspace. Passwords are handled by Firebase Authentication;
RemoNook does not store them in notes, IndexedDB, its sync API, or logs.

## Sync backend

Deploy the matching sync Worker before enabling email accounts. Its Firebase JWT
verifier allows `google.com` and `password` providers, retaining signature,
issuer, audience, expiry, and account UID checks. `/health` advertises these in
`authProviders`; staging frontend deployment requires password support. Older
Workers restricted to Google reject otherwise-valid email sessions with HTTP 401.
No database migration is needed.

## Staging configuration

In https://console.firebase.google.com/ select the staging project
`remonook-staging` (project ID; the display name may differ).
Open Build → Authentication → Sign-in method → Add new provider → Email/Password.
Enable **Email/Password** and save. Leave email-link/passwordless sign-in disabled.
Keep the existing Google provider and authorized domains unchanged.

Under Authentication → Templates, review the verification and password-reset
email sender name and action URLs. Firebase's hosted email action handler is used;
no Google Tasks OAuth client or client secret is needed for email accounts.
Use Firebase's password policy settings if stronger server-side requirements are
needed; the signup form requires at least eight characters and displays policy
errors from Firebase. Enable email enumeration protection in the project's
Authentication settings when available. The reset screen always uses a generic
success response for unknown addresses.

Local builds deliberately disable cloud authentication. Use staging to exercise
real account creation and email delivery. Production uses its separate project
and is not enabled or deployed as part of this change.

## Use

Select Sign in or Get started, then continue with Google, sign in with an email
and password, or choose Create an account. New email accounts receive a
verification email. Account settings offer resend and a verification check.
Verification does not block access to the user's private notes.
Forgot password sends a Firebase password-reset email.

Existing Google users: sign in with Google, open Settings → Account, and select
Add email sign-in. This links a password to the current verified account, keeping
its UID and workspace. Do not create a second account to access existing notes.
Firebase controls matching and linking when Google is used for the same address;
any account collision directs the user to their existing sign-in method.

Guest notes remain in the guest workspace. The normal explicit guest-import path
and automatic cloud sync remain unchanged.

## Acceptance

- Enable the provider in staging; create a synthetic email account; receive and
  follow verification; check verification; sign out and back in; reload.
- Create a note, sign out, sign back in with the same email, and verify sync.
- Send password reset and confirm the new password works.
- Check incorrect password, existing email signup, offline, rate limit, password
  policy errors, and blocked Google popups.
- Link a password from a Google account. Sign out; sign in with email; verify the
  exact same UID, notes, and Google Tasks connection remain available.
- Verify guest/account isolation and pending local saves before account changes.
- Check keyboard focus trapping/return, Escape, password manager autofill, mobile
  keyboard, narrow screens, and light/dark themes.
