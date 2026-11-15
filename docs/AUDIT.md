# Implementation audit

## Current checkpoint — 2026-11-15

Scope is repository and CI evidence through [PR #20](https://github.com/Vertex-Systems-Network/series-viral-box/pull/20). Task states live in [BACKLOG.md](BACKLOG.md) and the active branch and next command live in [STATE.md](STATE.md).

| Priority | Verified capability | Remaining acceptance |
| --- | --- | --- |
| P0 | Loopback admin, NestJS fixture API, Next.js viewer proxy and isolated native sessions. | Production public and operator identity, environment separation and request authorization. |
| P0 | Policy tests cover territory, access windows and grant expiry. Fixture HLS and MP4 signing and decoding passed locally and in CI. | Persist episode rights in P1-01 and enforce grants at the production API and delivery boundary, including revocation. |
| P0 | Registry contains 139 identities, including two discovery roots. The pilot gate checks evidence separately. | Authoritative inventory, documented rate limits, approved masters and distribution rights for the selected live candidate. |
| P1 | Versioned migrations, replay and rollback tests, PostgreSQL CI and frozen pnpm installation. | P1-01 rights windows and production restore evidence. |
| P1 | Signed Google and Apple fixtures, explicit account linking, durable account mail and audited fixture support. | Live provider callbacks on HTTPS, mail deliverability and authenticated operator identities. |
| P1 | Next.js/NestJS HTTP and Chromium parity, native fixture grants and Expo JavaScript exports for Android and iOS. | Device or emulator runs, production native authentication and platform acceptance. |
| P1 | Private S3 round trip and local CDN stand-in checks. | Configured production storage/CDN, origin authorization and deployed round trip. |
| P2 | Manually started continuation supervisor with tested leases and blocked dependency isolation. | Keep the repo backlog and handoff current during task execution. |

CI checkpoints are linked from [STATE.md](STATE.md). A fixture or export check closes its own acceptance item. Production release still depends on the applicable phase gates and maintainer review.

---

## Historical baseline

### Draft PR 1 baseline audit

Baseline commit: aa2e72ca169d5592fa1916a795fea206cf7f2609. Scope: repo tree and PR change inventory, worker entry points and core persistence/contracts, browser and CI evidence, phase and handoff consistency. This is a static and test-evidence audit. Deployment access and third-party credentials were unavailable for live qualification.

| Priority | Finding and location | Delivery consequence |
| --- | --- | --- |
| P0 | apps/worker/media-admin.mjs binds to loopback and multiplexes admin, viewer and fixture routes. Production session/authorization boundary and deployment entry point are absent. | Keep fixture mode local. Separate public/admin access and verify authorization before exposing media routes. |
| P0 | apps/worker/fixture-grants.mjs selects fixture assets. Signed local grants expire on time, while an already-issued URL does not consult viewer suspension or distribution state. | Define entitlement, expiry and revocation semantics before serving production assets. |
| P0 | scripts/catalog-coverage.mjs trusts caller-supplied completeness and tracks metadata only. Registry includes directory roots and partial public observations. | Define auditable expected inventory per provider, locale and feed. Compare title/episode identity independently from media coverage. Do not promote a sample or registry count to full coverage. |
| P1 | db/catalog.sql is a fixture bootstrap DDL file. It contains accumulated ALTERs and lacks a migration ledger. | Add versioned migrations and upgrade/restore tests before production persistence. |
| P1 | apps/worker/oauth-flow.mjs tests state, cancellation and replay. Successful Google/Apple exchanges, Apple cross-site callback, explicit linking and recovery-through-browser lack live evidence. | Test successful and rejected callbacks with provider doubles first. Verify live after credentials and HTTPS origin exist. |
| P1 | Reset mail is asynchronous and lacks a durable outbox. Sendmail and verification/browser paths have no live delivery evidence. | Add durable delivery/retry and browser tests. Verify real deliverability with a configured sender. |
| P1 | Local disk serving and S3 upload paths exist. Admin CDN settings only supply a delivery base. No live CDN signer/origin round trip has passed. | Validate local and CDN playback/download paths independently. Keep upstream media URLs server-side. |
| P1 | Next.js, NestJS and Expo are target architecture. Runnable entry points are npm workspaces, plain Node modules and a fixture web UI. | Track platform migration explicitly. Preserve tested API, catalog and media contracts during rollout. |
| P2 | Viewer library has favorites and seek resume. List reads cap at 100 and progress is last-write-wins. Full account and viewer management remain incomplete. | Add clear pagination, multi-device semantics and account controls before launch. |
| P2 | Continuation supervisor is a manually invoked command runner. | Keep manual startup and in-session continuation. No AI scheduling in this chat. |

## Evidence

- [Registry validation](https://github.com/wpessential/series-viral-box/actions/runs/43552063048) validates registry presence. It does not measure catalog completeness.
- [Catalog sync CI](https://github.com/wpessential/series-viral-box/actions/runs/43552063201) exercises worker tests and a PostgreSQL 17 fixture replay.
- [Media playback CI](https://github.com/wpessential/series-viral-box/actions/runs/43552063081) exercises fixture HTTP delivery and Chromium browser flows. Browser smoke wraps production modules in a test server. Full public deployment, OAuth and mail are outside this run.
- The public-source evidence and known exceptions remain in [SOURCES.md](SOURCES.md).

Review [STATE.md](STATE.md) for the current handoff and [BACKLOG.md](BACKLOG.md) for execution order.
