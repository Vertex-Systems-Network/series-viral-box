# Project memory

**Baseline:** Planning and fixture catalog implementation. Deployments and provider contracts have yet to be verified. The repository began with a placeholder README.

**Decisions:** Build web and native app with TypeScript, Next.js, Expo, NestJS, Postgres and BullMQ. Serve verified media from object storage and CDN. Keep AI implementation workflow in Git. Keep discovery source, underlying provider and media delivery status separate. One full series is the first live pilot.

**Ready after plan merge:** P0-01 workspace and CI, P0-02 source registry and pilot qualification, and P4-01 design AI workflow. Begin implementation at P0-01 unless a live task claim already exists.

**Open:** Production feed and media scope, launch languages and territories, native file export versus offline playback, identity/account model, hosting budget, release ownership and design tool choice. Fixture development is ready independently of live feed access.

**Latest handoff:** Planning baseline. No implementation checks have run. Every completed task updates this file and the [backlog](BACKLOG.md) with evidence and the next actionable step.

**Coverage decision:** The provider registry covers apps found on ReelFren, DramaFren and comparable websites and expands as new sources are discovered. The live pilot remains the first validation step. See [source candidates](SOURCES.md) and backlog tasks P7-02/P7-03.

**Implementation evidence:** P0-02 registry seed now contains 76 records. Local validation passed for all records and for duplicate rejection, repeated discovery, pending status and HTTPS validation. Live feed qualification, production connectors, and database synchronization remain pending. Next action is P0-01 workspace and service bootstrap, with fixture adapter and catalog persistence to follow.

**Latest handoff:** The draft PR now includes a Node.js npm workspace, a PostgreSQL fixture importer, a schema, and a catalog sync CI workflow. `npm test` passed on Node.js 24 with embedded PostgreSQL, covering replay, episode additions and edits, omission, invalid input, and transactional rollback. Standalone PostgreSQL 17 smoke-check is defined in CI and its result is unverified. npm workspaces and SQL are the initial bootstrap choices documented here. The pnpm/Prisma target, service shells, durable checkpoints, real connectors and media pipeline remain open. Next action: verify CI and add the adapter interface and sync-run records.

**Checkpoint handoff:** The fixture CLI now uses a paged provider adapter. Catalog writes, checkpoint revision, and run counters commit together per page. Local `npm test` passed both integration tests, including page failure and resume. This is scan resumption. Incremental feed watermarks, stale running-run recovery, and real-provider qualification remain open. Next: add source health and reconcile interrupted runs, then qualify the first documented feed.

**Source health handoff:** Added SQL health reporting, per-source session locking, abandoned-run recovery on retry, and opaque provider watermarks committed only on a successful terminal page. Three local embedded PostgreSQL tests passed. Live connector qualification, scheduled retries, admin HTTP reporting, and standalone PostgreSQL verification of the new session-lock behavior remain open. Next: qualify a documented feed and implement its incremental adapter.

**Coverage handoff:** Registry contains 79 records including all 76 original entries and three newly observed candidates. Local checks verified the required-source list and exercised complete, missing, partial and unknown episode inventory cases. Live inventories and media coverage remain unverified. Next: obtain and qualify a complete provider inventory and connect adapter/DB exports to the coverage gate.

**Directory reconciliation:** Required baseline now pins 139 source identities, including 42 DramaBos and 18 Where to Watch Drama provider entries. This is public directory coverage. Next verify per-provider episode inventories and connect catalog exports to the coverage gate.
