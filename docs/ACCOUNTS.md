# Viewer accounts

Use http://127.0.0.1:3101/catalog (or the configured loopback port). Re-run fixture sync to initialize the new tables. Local cookie transport uses HTTP on loopback. The account handler supports Secure cookies for a future HTTPS integration. Login/register requests are limited per client IP in the local service. Fixture grants require ENABLE_FIXTURE_DEMO=1, a session, and a published local fixture asset.

Admin can send bearer-authenticated GET /admin/users and PATCH /admin/users?id=UUID&disabled=true or false. GET returns up to 100 accounts with nextCursor for the after parameter. Status changes revoke existing sessions.

## Remaining user account work

- Google and Sign in with Apple, with independent admin enable flags, provider client settings, secret storage, validated callbacks and explicit account linking.
- Email verification, password reset/change, session management, profile and account deletion.
- Watch history and progress, bookmarks, and access rules per episode.
- Admin user search, audit events, viewer support actions and admin UI.
- HTTPS deployment, production abuse controls, browser click-through and OAuth integration tests.
