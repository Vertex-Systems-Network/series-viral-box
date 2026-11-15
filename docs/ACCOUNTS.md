# Viewer accounts

Use http://127.0.0.1:3101/catalog (or the configured loopback port). Re-run fixture sync to initialize the new tables. Local cookie transport uses HTTP on loopback. The account handler supports Secure cookies for a future HTTPS integration. Login/register requests are limited per client IP in the local service. Fixture grants require ENABLE_FIXTURE_DEMO=1, a session, and a published local fixture asset.

Admin can send bearer-authenticated GET /admin/users and PATCH /admin/users?id=UUID&disabled=true or false. GET returns up to 100 accounts with nextCursor for the after parameter. Status changes revoke existing sessions.

## Remaining user account work

- Google and Apple live callback verification.
- Signed-in password change, session management, profile and account deletion.
- Watch history and progress, bookmarks, and access rules per episode.
- Admin user search, audit events, viewer support actions and admin UI.
- HTTPS deployment, production abuse controls, browser click-through and OAuth integration tests.

## Google and Apple provider configuration

Initialize the updated schema before using bearer-authenticated GET or PUT /admin/oauth-settings. PUT supplies the full settings for a single provider. To disable a provider while retaining IDs, send the IDs with enabled=false. Google accepts provider=google and clientId. Apple accepts provider=apple, clientId (Services ID), teamId and keyId. Both require a boolean enabled field.

Set GOOGLE_CLIENT_SECRET or APPLE_PRIVATE_KEY out of band on the server. API responses expose only whether the corresponding environment value is configured. Set AUTH_PUBLIC_ORIGIN to the HTTPS site origin with no trailing slash, route it to the loopback service through a trusted HTTPS proxy, and preserve the public Host header. Register /v1/oauth/google/callback and /v1/oauth/apple/callback with the respective provider. The catalog shows links only for enabled providers with required settings. New social identities require a verified email and attach by provider subject. If a provider email already belongs to an account, sign in to that account first and use **Link Google account** or **Link Apple account** in the catalog. Linking starts with a same-origin POST from an active session. The callback consumes one browser-bound attempt, checks the initiating session again, and rejects identities already attached to another viewer. Linking keeps the existing session. Apply migration 003 before serving OAuth routes. Signed provider fixtures cover Google redirect and Apple form POST callbacks. Live providers still require the configured HTTPS origin and credentials.

- [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)

## Viewer library API

Signed-in viewers can list or save/delete bookmarks at /v1/me/bookmarks and list or update playback position at /v1/me/progress. Writes take source, titleId and locale query parameters. Progress also takes episodeId and position in whole seconds. GET returns up to 100 most recent records. All records are scoped to the active session's user. Browser writes require the site's configured Origin. The local catalog includes My List and the fixture watch page saves and restores position. GET progress with an episode identity returns its position directly.

## Password recovery

Configure the HTTPS AUTH_PUBLIC_ORIGIN, an absolute SENDMAIL_PATH to a compatible mail transfer agent, and RESET_MAIL_FROM. Apply the updated schema. Users can request a link from the login dialog. Reset links expire after 20 minutes, newer requests invalidate prior links, and successful reset revokes viewer sessions. The server stores token hashes. Configure deliverability on the mail host. Mail delivery is asynchronous in the loopback web service and has no durable outbox yet.

## Verify an email address

With HTTPS and the same sendmail settings as password recovery, a signed-in viewer can request a link from the catalog. Verification tokens expire after 30 minutes. Resending invalidates the prior link. Confirmation consumes the token and records a verified timestamp on the account. Existing and newly created accounts can use this flow. The current fixture access policy continues to require an active session.
