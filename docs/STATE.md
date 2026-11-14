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

**DB coverage handoff:** Coverage checker accepts `expected.json --db`. Embedded PostgreSQL verified real fixture writes produce the expected source/title/locale/episode identities. DramaBos documentation was reviewed for feed qualification. Complete live inventory and production access remain unverified. Next: qualify a full inventory export, implement its adapter, then run the coverage gate with that export and staging DB.

**Snapshot import handoff:** Versioned JSON inventories can now be imported using the provider registry and the durable sync worker. Local embedded PostgreSQL verified a 101-title snapshot, interruption after the first page, changed-file rejection, resume and duplicate-free replay. Live snapshot access and coverage remain open. Next action: obtain a complete provider export and compare it against the staging database.

**Live catalog pilot (2026-11-14):** ReelFren's [public sitemap](https://reelfren.net/sitemap.xml) returned 1,400 loc entries, including 1,120 localized drama URLs for 20 Anamana title paths only. The [sample detail page](https://reelfren.net/drama/anamana/1000383-the-duke-s-substitute-groom?lang=en) declared 30 episodes but exposed 20 links. The [watch page episode selector](https://reelfren.net/watch/anamana/1000383-the-duke-s-substitute-groom?ep=1&lang=en) exposed numbers 1–30. Imported these 30 metadata records into local embedded PostgreSQL and replayed the import. Coverage returned 30 expected, 30 imported, zero missing within the sampled series, and inventory-partial for the provider. The global gate correctly exited 1. DramaFren v2 catalog returned HTTP 200. Both public DramaBos hosts returned HTTP 404 for the documented ShortMax homepage path without credentials. No live media ingestion or production DB verification. To extend the pilot, qualify a full source inventory beyond public discovery pages.

**Repeatable catalog pilot:** Added the public Anamana sitemap-to-snapshot command. A live three-title sample reconciled 90 episode entries against declared counts. This collector covers the sitemap's Anamana subset. Next source priorities are DramaFren v2 catalog pagination and provider-specific feed qualification.

**DramaFren v2 pilot:** The public DramaBox catalog collector followed two live pages, found 45 distinct titles, and skipped three duplicate cards. Import and replay on local embedded PostgreSQL retained 45 titles and zero episode rows. Declared counts are recorded in the snapshot. Playback, individual episode inventory and full provider coverage remain unverified. Next: qualify a source that exposes stable episode identities or a complete inventory export.

**Multi-provider pilot:** Added a selected-title ReelFren collector that shares checks with the Anamana sitemap collector. Live runs reconciled 44 SixthShort and 43 Sereal+ episode entries. Both snapshots imported and replayed in embedded PostgreSQL with 87 total episode rows. Provider-wide discovery and media eligibility remain open.

**Public discovery handoff:** Added the ReelFren Explore discovery manifest command. Live check mapped browse links for all 53 registry providers and found 1,870 title links spanning 49 providers. AniBoy, Vigloo, DramaNova and iQIYI had no title links in that snapshot. No unmapped routes appeared. Next: traverse each provider's public browse page and test the handoff from discovered titles to the episode collector.

**Provider browse handoff:** Scanned four previously unknown routes. AniBoy added 24 titles and Vigloo added 30. DramaNova yielded no matching title links and iQIYI returned HTTP 500. The saved manifest retained all 53 registry providers and recorded 1,924 title links across 51. The manifest-to-collector path verified 44 episode records from a live SixthShort title. Full per-provider pagination and media verification remain open.

**Continuation rule:** Active agents advance through ready work without a user prompt after each checkpoint. The cross-session runner remains an implementation task. Its first acceptance scenario is two consecutive ready tasks resumed across separate executions with no manual continuation.

**Runner handoff:** The SQLite continuation runner supports once, drain, supervise, status, pause and resume. Local process tests passed durable resumption, pause, blocked-dependency isolation and automatic dispatch to separate child processes. No hosted scheduler or live AI executor is active. Next: define the reviewed task manifest and connect the scoped AI executor and scheduler.
