# Series Viral Box

Planning repository for a multi-provider streaming catalog and native app.

- [AI agent instructions](AGENTS.md)
- [Current state and handoff](docs/STATE.md)
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

The fixture command initializes the catalog tables in that database and upserts a fictional series and its episodes. Run it twice to verify replay. The local test suite uses embedded PostgreSQL. The Catalog sync workflow exercises the CLI against PostgreSQL 17.

The adapter contract is `{ source, fetchPage(cursor) }`. Each page returns `{ titles, nextCursor }`. A null cursor starts a scan and a null next cursor ends it. After a failed run, rerun the same source to resume from its last committed cursor. Run history lives in `catalog_sync_run` and checkpoints in `catalog_checkpoint`. A completed scan starts at the beginning on its next run.

Adapters receive `fetchPage(cursor, { watermark })`. A provider that supports incremental changes may return an opaque watermark on its final page. The checkpoint retains the previous watermark through partial runs. Use a dedicated database connection for `runSync`. A session lock prevents concurrent workers on separate connections for the same source. On its next run, the worker marks abandoned runs failed and resumes the committed checkpoint.

Inspect source health with `SELECT * FROM catalog_source_health ORDER BY source;`. The view reports the most recent run, last successful completion and pending resume cursor for each attempted source.

## Read the local catalog

Start `node apps/worker/media-admin.mjs` with DATABASE_URL and MEDIA_ADMIN_TOKEN after initializing the schema. The loopback service provides read-only endpoints:

- `GET /v1/providers` lists source keys present in the database.
- `GET /v1/titles?source=fixture&locale=en&limit=20` lists titles. Pass the returned nextCursor with the same filters to continue.
- `GET /v1/title?source=fixture&locale=en&id=demo-series` returns a title and its episodes.

Open `/catalog` on the loopback service to browse providers, filter by locale, page through titles, and view episode lists.
