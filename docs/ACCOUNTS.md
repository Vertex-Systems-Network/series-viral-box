# Viewer accounts

Use http://127.0.0.1:3101/catalog (or the configured loopback port). Re-run fixture sync to initialize the new tables. Local cookie transport uses HTTP on loopback. The account handler supports Secure cookies for a future HTTPS integration. Login/register requests are limited per client IP in the local service. Fixture grants require ENABLE_FIXTURE_DEMO=1, a session, and a published local fixture asset.

Admin can send bearer-authenticated GET /admin/users and PATCH /admin/users?id=UUID&disabled=true or false. GET returns up to 100 accounts with nextCursor for the after parameter. Status changes revoke existing sessions. Apply migration 005 for support history. Open /admin/accounts on the loopback service and enter the existing bearer token. The panel lists viewers, looks up an exact email, suspends or restores access, and displays the last 50 support events. Events record the configured MEDIA_ADMIN_ACTOR label, or media-admin by default. A shared token identifies the service operator role. Per-operator authentication remains a production dependency.

## Signed-in settings

Open **Account settings** in the catalog to view the account email, change an existing password, or sign out other sessions. Password changes require the current password, cancel outstanding reset links and revoke sibling sessions. The current session remains active. Social-only accounts can use session controls.

## Remaining user account work

- Google and Apple live callback verification.
- Additional profile editing and account deletion.
- Watch history and progress, bookmarks, and access rules per episode.
- Per-operator production admin identities and broader support actions.
- HTTPS deployment, production abuse controls, browser click-through and OAuth integration tests.

## Google and Apple provider configuration

Initialize the updated schema before using bearer-authenticated GET or PUT /admin/oauth-settings. PUT supplies the full settings for a single provider. To disable a provider while retaining IDs, send the IDs with enabled=false. Google accepts provider=google and clientId. Apple accepts provider=apple, clientId (Services ID), teamId and keyId. Both require a boolean enabled field.

Set GOOGLE_CLIENT_SECRET or APPLE_PRIVATE_KEY out of band on the server. API responses expose only whether the corresponding environment value is configured. Set AUTH_PUBLIC_ORIGIN to the HTTPS site origin with no trailing slash, route it to the loopback service through a trusted HTTPS proxy, and preserve the public Host header. Register /v1/oauth/google/callback and /v1/oauth/apple/callback with the respective provider. The catalog shows links only for enabled providers with required settings. New social identities require a verified email and attach by provider subject. If a provider email already belongs to an account, sign in to that account first and use **Link Google account** or **Link Apple account** in the catalog. Linking starts with a same-origin POST from an active session. The callback consumes one browser-bound attempt, checks the initiating session again, and rejects identities already attached to another viewer. Linking keeps the existing session. Apply migration 003 before serving OAuth routes. Signed provider fixtures cover Google redirect and Apple form POST callbacks. Live providers still require the configured HTTPS origin and credentials.

- [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)

## Viewer library API

Signed-in viewers can list or save/delete bookmarks at /v1/me/bookmarks and list or update playback position at /v1/me/progress. Writes take source, titleId and locale query parameters. Progress also takes episodeId and position in whole seconds. GET returns up to 100 most recent records. All records are scoped to the active session's user. Browser writes require the site's configured Origin. The local catalog includes My List and the fixture watch page saves and restores position. GET progress with an episode identity returns its position directly.

## Password recovery

Configure the HTTPS AUTH_PUBLIC_ORIGIN, an absolute SENDMAIL_PATH to a compatible mail transfer agent, and RESET_MAIL_FROM. Apply the updated schema. Users can request a link from the login dialog. Reset links expire after 20 minutes, newer requests invalidate prior links, and successful reset revokes viewer sessions. The server stores token hashes. Configure deliverability on the mail host. The service supports an optional durable outbox for asynchronous delivery.

## Durable account mail

Apply migration 004. Set the same `MAIL_OUTBOX_KEY` on the web service and mail worker, using a randomly generated 32-byte key encoded as hex. Start `node apps/worker/send-account-mail.mjs` with the configured database, HTTPS origin, sender and sendmail executable. Keep the key outside the database. Existing pending jobs require the original key, so drain the queue before rotating it.

The web service writes the token hash and encrypted delivery job atomically. The worker claims due jobs, discards expired and replaced links, retries transport errors with bounded backoff, and removes successful jobs. A crash after delivery and before completion can cause a duplicate message with the same single-use link. Direct delivery remains available for existing setups without an outbox key. Live sender deliverability remains to be verified.

## Verify an email address

With HTTPS and the same sendmail settings as password recovery, a signed-in viewer can request a link from the catalog. Verification tokens expire after 30 minutes. Resending invalidates the prior link. Confirmation consumes the token and records a verified timestamp on the account. Existing and newly created accounts can use this flow. The current fixture access policy continues to require an active session.
