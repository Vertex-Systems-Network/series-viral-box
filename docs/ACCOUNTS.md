# Viewer accounts

Use http://127.0.0.1:3101/catalog (or the configured loopback port). Re-run fixture sync to initialize the new tables. Local cookie transport uses HTTP on loopback. The account handler supports Secure cookies for a future HTTPS integration. Login/register requests are limited per client IP in the local service. Fixture grants require ENABLE_FIXTURE_DEMO=1, a session, and a published local fixture asset.

Admin can send bearer-authenticated GET /admin/users and PATCH /admin/users?id=UUID&disabled=true or false. GET returns up to 100 accounts with nextCursor for the after parameter. Status changes revoke existing sessions.

## Remaining user account work

- Google and Apple live callback verification and explicit linking for existing accounts.
- Email verification, password reset/change, session management, profile and account deletion.
- Watch history and progress, bookmarks, and access rules per episode.
- Admin user search, audit events, viewer support actions and admin UI.
- HTTPS deployment, production abuse controls, browser click-through and OAuth integration tests.

## Google and Apple provider configuration

Initialize the updated schema before using bearer-authenticated GET or PUT /admin/oauth-settings. PUT supplies the full settings for a single provider. To disable a provider while retaining IDs, send the IDs with enabled=false. Google accepts provider=google and clientId. Apple accepts provider=apple, clientId (Services ID), teamId and keyId. Both require a boolean enabled field.

Set GOOGLE_CLIENT_SECRET or APPLE_PRIVATE_KEY out of band on the server. API responses expose only whether the corresponding environment value is configured. Set AUTH_PUBLIC_ORIGIN to the HTTPS site origin with no trailing slash, route it to the loopback service through a trusted HTTPS proxy, and preserve the public Host header. Register /v1/oauth/google/callback and /v1/oauth/apple/callback with the respective provider. The catalog shows links only for enabled providers with required settings. New social identities require a verified email and attach by provider subject. Existing email collisions require an explicit link workflow, which remains pending.

- [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)

## Viewer library API

Signed-in viewers can list or save/delete bookmarks at /v1/me/bookmarks and list or update playback position at /v1/me/progress. Writes take source, titleId and locale query parameters. Progress also takes episodeId and position in whole seconds. GET returns up to 100 most recent records. All records are scoped to the active session's user. Browser writes require the site's configured Origin. The local catalog includes My List and the fixture watch page saves and restores position. GET progress with an episode identity returns its position directly.
