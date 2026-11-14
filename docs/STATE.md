# Project memory

**Baseline:** Planning only. Product code, deployments and provider contracts have yet to be verified. The repository began with a placeholder README.

**Decisions:** Build web and native app with TypeScript, Next.js, Expo, NestJS, Postgres and BullMQ. Serve verified media from object storage and CDN. Keep AI implementation workflow in Git. Keep discovery source, underlying provider and media delivery status separate. One full series is the first live pilot.

**Ready after plan merge:** P0-01 workspace and CI, P0-02 source registry and pilot qualification, and P4-01 design AI workflow. Begin implementation at P0-01 unless a live task claim already exists.

**Open:** Production feed and media scope, launch languages and territories, native file export versus offline playback, identity/account model, hosting budget, release ownership and design tool choice. Fixture development is ready independently of live feed access.

**Latest handoff:** Planning baseline. No implementation checks have run. Every completed task updates this file and the [backlog](BACKLOG.md) with evidence and the next actionable step.

**Coverage decision:** The provider registry covers apps found on ReelFren, DramaFren and comparable websites and expands as new sources are discovered. The live pilot remains the first validation step. See [source candidates](SOURCES.md) and backlog tasks P7-02/P7-03.
