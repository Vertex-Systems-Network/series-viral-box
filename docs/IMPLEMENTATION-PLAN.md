# Series Viral Box detailed implementation plan

## 1. Product and launch scope

Build a web and native mobile catalog for short series across multiple providers. Viewers browse and filter titles, open episode lists, sign in when they choose Watch or Download, save titles, and resume episodes. Admin manages provider health, inventory gaps, viewer accounts, sign-in settings, storage and delivery. Launch with one validated series and expand source by source.

The user-supplied ReelFren and DramaFren inventories are mandatory discovery inputs. Comparable directories and official provider sites extend that baseline. Preserve source-specific variants, locale and region. Measure completeness against independently obtained inventories. Report unknown and partial coverage explicitly.

## 2. Current implementation and evidence

| Area | Verified fixture capability | Production acceptance still open |
| --- | --- | --- |
| Sources | 139 registered identities, partial collectors, and pilot evidence gate | Complete inventory, documented limits and approved distribution |
| Catalog | Transactional replay, checkpoints, migrations and read API | Shared generated API contract, production jobs and restore test |
| Media | HLS and MP4 packaging, signed grants, private origin/CDN stand-in and CI playback | Durable ingest, production entitlement enforcement and deployed CDN |
| Accounts | Recovery and verification in Chromium, linking with signed provider fixtures, durable mail and audited support | Live OAuth, configured mail sender and production operator identity |
| Platforms | NestJS and Next.js parity, native fixture bearer sessions, Expo exports | Emulator and device testing, production native authentication |
| Workspace | Frozen pnpm install and local PostgreSQL, Redis and private S3 checks | Production environment and worker queue integration |

See [AUDIT.md](AUDIT.md) and [STATE.md](STATE.md) for evidence links and the active checkpoint.

## 3. Target architecture

| Layer | Target | Contract |
| --- | --- | --- |
| Website and admin | Next.js | Public catalog, authenticated viewer flows, separate admin surface |
| Mobile | Expo / React Native | Shared catalog types and API client, native media player and platform-specific download behavior |
| API | NestJS on Node.js | Versioned REST and OpenAPI, catalog, sessions, viewer library, entitlement and admin |
| Data | PostgreSQL, planned Prisma integration | Stable identities, assets, access windows, users and audit records |
| Workers | Redis and BullMQ | Bounded provider sync, ingestion, mail and retry jobs |
| Storage and delivery | Local disk default, optional S3-compatible storage and CDN | Verify assets before publication and issue short-lived media access |

The existing pnpm workspace, fixture routes and Expo harness are the implementation baseline. Establish contract parity before switching callers. Follow [architecture](PLAN.md) and record changes to target choices as ADRs.

## 4. Catalog sync and completeness

1. Register every candidate under a stable source key. Track provider identity, original directory, locale, territory, documented endpoint, inventory scope, paging, limits, verification date and metadata/media capabilities.
2. Backfill provider inventory from a qualified feed or snapshot. Normalize title and episode identities. Preserve source mappings when merging a canonical series across feeds. Review ambiguous matches.
3. Commit each validated page and checkpoint in one transaction. Use stable upsert keys. Advance upstream watermark only after terminal-page success. Resume from the saved cursor after interruption. Use confirmed tombstones or verified complete scans for removals.
4. Treat expired media URLs as fresh resolution requests. Treat schema, authentication and route changes as connector incidents. Keep the last successful catalog, mark the affected feed degraded and resync after testing a connector fix.
5. Compare expected versus stored title/episode identities by source and locale. Report missing, imported, unknown and partial inventory. Track playable and downloadable coverage separately. Require independent evidence for completeness and keep directory roots out of episode denominators.

## 5. Media delivery

Verify hosting and download scope per episode and territory. Queue eligible master files for staged ingestion with bounded size and time. Validate input, checksum and rendition outputs. Package HLS and an MP4 rendition when download distribution is supported. Publish an immutable asset version and switch the database pointer atomically. Retain the previous valid asset on a failed replacement. Reconcile abandoned uploads.

Default to local disk. Support optional object storage uploads and an admin-managed HTTPS CDN delivery base. CDN origin settings and upload credentials have separate responsibilities. Serve web playback through the blob player over signed same-origin playlist/segment routes. Keep provider and bucket URLs server-side. Temporary requests to our media service remain visible in browser networking. Download uses a separately scoped MP4 grant.

Issue grants after checking session, viewer status, episode access, territory, distribution window and asset availability. Define expiry and revocation behavior for issued URLs before production release. Verify browser playback, MP4 range requests, native playback, origin failures and disabled-account cases.

## 6. Viewer, identity and admin

- **Viewer session** — email registration/login/logout, secure production cookies, rate limiting, session management and account disable checks. Signed-out Watch/Download opens login. Resume the intended action after authentication.
- **Account integrity** — expiring single-use email verification and password reset, session revocation on password reset, profile/password controls and account deletion. Use durable mail delivery with controlled retries. Verify reset and verification from the browser.
- **Google and Apple** — independent admin enable flags and provider IDs. Keep secret material server-side. Validate state, nonce, issuer, audience and signature. Identify accounts by provider subject. Explicitly link existing accounts after authenticated confirmation. Verify both live over HTTPS before rollout.
- **Viewer library** — bookmarks, progress, history and resume, scoped by account and episode. Define multi-device progress conflict behavior and pagination.
- **Admin** — separate permissions for user support, source operations and delivery configuration. Provide searchable user management, session revocation, OAuth/CDN settings, catalog health, media availability, resync and audit history. Protect credentials and auth tokens from logs and responses.

## 7. Delivery phases

| Phase | Scope | Exit evidence |
| --- | --- | --- |
| P0 | Workspace, registry, CI and repo handoff | Clean checkout runs the fixture commands. Source baseline check passes. Manual continuation can resume saved work. |
| P1 | Migrations and shared catalog API | Clean database and seeded upgrade pass. Provider filters, pagination and client contract verified. |
| P2 | Durable provider imports and coverage | Backfill, retry, checkpoint, delta, drift and partial-scan cases verified. Per-source coverage reporting shows gaps. |
| P3 | Media ingestion and grants | Validate storage, rendition and publication. Verify entitlement, failure recovery, blob playback and scoped download. |
| P4 | Design and web/admin | Design AI finalizes responsive screens, tokens and states. Review web and admin against the spec with browser evidence. |
| P5 | Native mobile | Verify catalog, session, playback, resume and supported download behavior on iOS and Android. |
| P6 | Live pilot and release readiness | One complete licensed series passes live sync, new episode update, playback, download where eligible, backup restore and rollback. |
| P7 | Provider expansion | Qualify each connector, preserve required providers and variants, reconcile episode coverage and track ongoing changes. |

## 8. Execution order

Open [STATE.md](STATE.md) for the active claim and exact resume command. Use [BACKLOG.md](BACKLOG.md) as the sole status and dependency authority. After a checkpoint, commit test evidence and select the next ready in-scope task. Continue independent fixture work when live provider credentials, distribution scope or device tooling are unavailable. Keep production acceptance and device evidence separate from fixture and bundle verification.

## 9. Agent execution and handoff

Start with [AGENTS.md](../AGENTS.md), [STATE.md](STATE.md) and the backlog. Read the code and current CI for the selected task. Claim it using its ID. Write acceptance checks before implementation. Keep changes scoped and verify through the normal entry point. Record exact commands, results, commit or PR, blockers and the next executable action. Put finished implementation in review until merged.

Claude, Gemini, ChatGPT/Codex and Cursor use the same repository memory. Design agents use [DESIGN.md](DESIGN.md) and publish a versioned design link, interaction states, tokens and visual QA. Keep independent tasks moving when external data, credentials or hosting are blocked. The local continuation supervisor starts manually. This chat excludes AI scheduling.

## 10. Release gates and external dependencies

Before production release, close the P0 audit findings. Validate HTTPS, authorization, migration/restore, observability, media delivery, provider scope and rollback. Track credentials and configuration by environment. The external inputs are complete qualified inventories, reusable master files and distribution scope, HTTPS deployment origin, provider credentials, sender/mail transport and optional CDN/bucket access. Fixture implementation, design and contract tests can proceed while those inputs are outstanding.
