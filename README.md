# Series Viral Box

Repository for a multi-provider streaming catalog and native app.

- [AI agent instructions](AGENTS.md)
- [Current state and handoff](docs/STATE.md)
- [Baseline audit](docs/AUDIT.md)
- [Detailed implementation plan](docs/IMPLEMENTATION-PLAN.md)
- [Architecture and data flow](docs/PLAN.md)
- [Phases and delivery backlog](docs/BACKLOG.md)
- [Source inventory](docs/SOURCES.md)
- [AI design workflow](docs/DESIGN.md)

## Run the catalog fixture

With Node.js 22+ and an empty local PostgreSQL database, run:

```sh
npm ci
npm test
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/catalog npm run sync:fixture
```

The fixture command applies pending SQL migrations in `db/migrations` and upserts a fictional series and its episodes. A transaction and database advisory lock protect the migration ledger. Existing databases created by the legacy `db/catalog.sql` bootstrap are adopted in place. Keep applied migration files immutable and add new numbered SQL files for schema changes. Run it twice to verify replay. The local test suite uses embedded PostgreSQL. The Catalog sync workflow exercises the CLI against PostgreSQL 17.

The adapter contract is `{ source, fetchPage(cursor) }`. Each page returns `{ titles, nextCursor }`. A null cursor starts a scan and a null next cursor ends it. After a failed run, rerun the same source to resume from its last committed cursor. Run history lives in `catalog_sync_run` and checkpoints in `catalog_checkpoint`. A completed scan starts at the beginning on its next run.

Adapters receive `fetchPage(cursor, { watermark })`. A provider that supports incremental changes may return an opaque watermark on its final page. The checkpoint retains the previous watermark through partial runs. Use a dedicated database connection for `runSync`. A session lock prevents concurrent workers on separate connections for the same source. On its next run, the worker marks abandoned runs failed and resumes the committed checkpoint.

Inspect source health with `SELECT * FROM catalog_source_health ORDER BY source;`. The view reports the most recent run, last successful completion and pending resume cursor for each attempted source.

## Read the local catalog

Start `node apps/worker/media-admin.mjs` with DATABASE_URL and MEDIA_ADMIN_TOKEN after initializing the schema. The loopback service provides read-only endpoints:

- `GET /v1/providers` lists source keys present in the database.
- `GET /v1/titles?source=fixture&locale=en&limit=20` lists titles. Pass the returned nextCursor with the same filters to continue.
- `GET /v1/title?source=fixture&locale=en&id=demo-series` returns a title and its episodes.

Open `/catalog` on the loopback service to browse providers, filter by locale, page through titles, and view episode lists.

For the loopback fixture demo, set `ENABLE_FIXTURE_DEMO=1` alongside `MEDIA_SIGNING_KEY` and publish the fixture media first. `/catalog` then provides Watch and Download actions for published fixture episodes. Leave the flag unset outside a local demo.


## Run the Next.js and NestJS catalog slice

After fixture sync, start the NestJS viewer API with `DATABASE_URL=... npm run -w @series-viral-box/api start`. It defaults to loopback port 3103. In another terminal run `npm run -w @series-viral-box/web dev` and open http://127.0.0.1:3000. Use `CATALOG_API_PORT` and the Next server's `CATALOG_API_URL` to select another local upstream. The web slice lists and filters titles, pages through results, and shows episode metadata.

Run `npm run -w @series-viral-box/web build` and `node --test scripts/platform-parity.test.mjs` to exercise the built web app, NestJS transport and seeded catalog. The NestJS service also exposes the existing fixture viewer at `/catalog`. It uses the same account, OAuth, library and fixture-media handlers as the loopback worker. To test viewer playback, configure `ENABLE_FIXTURE_DEMO=1`, `FIXTURE_MEDIA_DIR`, and `MEDIA_SIGNING_KEY` as in [MEDIA.md](docs/MEDIA.md), and open the catalog on the NestJS origin. The Chromium fixture smoke now exercises this transport. Admin operations remain on the separate loopback media-admin service.

For a same-origin fixture, set `VIEWER_PUBLIC_ORIGIN=http://127.0.0.1:3000` on Next.js and `AUTH_PUBLIC_ORIGIN=http://127.0.0.1:3000` on NestJS. Keep `CATALOG_API_URL` set to the private NestJS origin. Open `/catalog` on the Next.js origin. Next.js forwards the viewer APIs, fixture watch page and signed media while preserving origin, cookies and range semantics. Configure an HTTPS public origin and real credentials for live OAuth. The operator interface is served separately by the loopback media-admin process. After building Next.js, run `node scripts/fixture-watch-smoke.mjs --next` to verify playback, progress and account recovery through the combined transport.
