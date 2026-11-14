# Current project handoff

**Baseline:** Draft PR [#1](https://github.com/wpessential/series-viral-box/pull/1), audited implementation commit `aa2e72c`. The project has a tested local fixture vertical slice. Merge and release have not been verified. Read [AUDIT.md](AUDIT.md), then [BACKLOG.md](BACKLOG.md) for the next task. Historical reports remain in Git history.

| Area | Current evidence |
| --- | --- |
| Catalog | 139 required source identities. Partial public collectors for ReelFren and DramaFren v2. PostgreSQL snapshots, checkpoint, retry recovery and episode coverage comparison implemented. Complete inventories and production ingestion remain unverified. |
| Media | FFmpeg rendition packaging, local-disk default, optional S3 fixture publication, admin CDN base settings, scoped local grants and same-origin blob playback. Hosted fixture Chromium passed. CDN signing and production entitlements remain open. |
| Accounts | Email registration/login/logout, auth popup, admin user list/suspend, My List/resume, recovery and verification implemented at local scope. Google/Apple settings and callback code exist. Live OAuth, explicit linking, mail and support actions remain open. |
| Platform | npm and Node.js loopback demo, PostgreSQL, plain web modules. Planned Next.js, NestJS and Expo applications and queue-backed workers remain open. |
| AI continuity | Repo-backed workflow and manually launched SQLite runner. Continue eligible work in-session and save the next actionable step. AI scheduling is excluded in this chat. |

**First task:** AUD-01. Add repeatable account browser coverage for password reset and verification using injected mail, without waiting for live credentials. Start from scripts/fixture-watch-smoke.mjs and the recovery/verification worker tests. Then take another ready item in backlog order. No production release while P0 findings remain open.

**External dependencies:** Complete licensed provider inventories, deployable public HTTPS origin, Google/Apple credentials, configured sender and CDN/bucket access. Work on fixtures, contract tests and design can proceed independently.
