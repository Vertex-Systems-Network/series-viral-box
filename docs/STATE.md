# Current project handoff

**Baseline:** Draft PR [#1](https://github.com/wpessential/series-viral-box/pull/1), audited implementation commit `aa2e72c`. The project has a tested local fixture vertical slice. Merge and release have not been verified. Read [AUDIT.md](AUDIT.md), then [BACKLOG.md](BACKLOG.md) for the next task. Historical reports remain in Git history.

| Area | Current evidence |
| --- | --- |
| Catalog | 139 required source identities. Partial public collectors for ReelFren and DramaFren v2. PostgreSQL snapshots, checkpoint, retry recovery and episode coverage comparison implemented. Complete inventories and production ingestion remain unverified. |
| Media | FFmpeg rendition packaging, local-disk default, optional S3 fixture publication, admin CDN base settings, scoped local grants and same-origin blob playback. Hosted fixture Chromium passed. CDN signing and production entitlements remain open. |
| Accounts | Email registration/login/logout, auth popup, admin user list/suspend, My List/resume, recovery and verification implemented at local scope. Google/Apple settings and callback code exist. Live OAuth, explicit linking, mail and support actions remain open. |
| Platform | npm and Node.js loopback demo, PostgreSQL, plain web modules. Planned Next.js, NestJS and Expo applications and queue-backed workers remain open. |
| AI continuity | Repo-backed workflow and manually launched SQLite runner. Continue eligible work in-session and save the next actionable step. AI scheduling is excluded in this chat. |

**AUD-01:** [Draft PR #2](https://github.com/Vertex-Systems-Network/series-viral-box/pull/2) adds password reset and email verification Chromium coverage with an in-memory mail transport. It checks revocation in a separate browser context and the signed-in account's verified status. The 10 worker tests and HTTP fixture smoke passed locally. Local Chromium was blocked by the runtime's Unix socket restriction. Check the PR's Media playback job for browser evidence.

**Next task:** AUD-02 is the next ready item. Review the existing fixture-grant and authorization contracts, then claim the task before implementation.

**External dependencies:** Complete licensed provider inventories, deployable public HTTPS origin, Google/Apple credentials, configured sender and CDN/bucket access. Work on fixtures, contract tests and design can proceed independently.
