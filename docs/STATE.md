# Current project handoff

**Merged baseline:** [Integration PR #10](https://github.com/Vertex-Systems-Network/series-viral-box/pull/10) consolidated the task branches. [PR #1](https://github.com/Vertex-Systems-Network/series-viral-box/pull/1) merged them to `main`.

| Task | State | Evidence and remaining scope |
| --- | --- | --- |
| AUD-01 | [PR #2](https://github.com/Vertex-Systems-Network/series-viral-box/pull/2) merged | Browser verification and password recovery, including old-session revocation. [Chromium CI passed](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43662929174). |
| AUD-02 | [PR #3](https://github.com/Vertex-Systems-Network/series-viral-box/pull/3) merged | Production entitlement policy and tests for playback and download, territory, expiry and revocation. Apply the policy at the production API and private delivery boundary. |
| AUD-03 | [PR #4](https://github.com/Vertex-Systems-Network/series-viral-box/pull/4) merged | Versioned migrations, legacy data adoption and rollback. [PostgreSQL CI passed](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43663324368). |
| AUD-04 | [PR #5](https://github.com/Vertex-Systems-Network/series-viral-box/pull/5) merged | Signed Google and Apple fixtures and explicit account linking. Live verification needs HTTPS and provider credentials. |
| AUD-05 | [PR #6](https://github.com/Vertex-Systems-Network/series-viral-box/pull/6) merged | Registry separates 2 discovery roots from 137 provider entries. Inventory and media evidence are tracked independently. Authoritative live exports remain open. |
| AUD-06 | [PR #7](https://github.com/Vertex-Systems-Network/series-viral-box/pull/7) merged | Decodable HLS and MP4 against a private fixture origin and CDN stand-in. Live CDN needs configured access. |
| AUD-07 | [PR #8](https://github.com/Vertex-Systems-Network/series-viral-box/pull/8) in progress | Next.js and NestJS read-only catalog parity. Remaining work includes the versioned design source, visual acceptance, the account/watch/download/admin contracts, and Expo. |
| AUD-08 | [PR #9](https://github.com/Vertex-Systems-Network/series-viral-box/pull/9) merged | Encrypted mail queue, signed-in account controls and audited admin support. Live sender and production operator identities remain open. |

**Integrated verification:** 23 worker tests, four media/continuation tests, HTTP fixture smoke, registry baseline, Next.js production build, and NestJS/Next.js HTTP parity passed together. Run `pnpm install --frozen-lockfile` then `pnpm test` and the parity commands below to reproduce the checkpoint.

**AUD-07 viewer transport:** [PR #12](https://github.com/Vertex-Systems-Network/series-viral-box/pull/12) moves the existing fixture account, OAuth, library and media routes into the NestJS entry point through a shared handler. Admin routes are still on the separate loopback service. Run `pnpm test` and `node scripts/fixture-watch-smoke.mjs --http-only` for worker and transport checks. The Media playback workflow tests the same NestJS transport in Chromium.

**AUD-07 same-origin fixture:** [PR #13](https://github.com/Vertex-Systems-Network/series-viral-box/pull/13) connects the existing viewer catalog and media routes through the Next.js origin. The built-app parity test verifies a session cookie round trip, cross-origin mutation rejection, a signed download range, HEAD semantics, and admin isolation.

**AUD-07 native client:** [PR #14](https://github.com/Vertex-Systems-Network/series-viral-box/pull/14) adds a platform-neutral catalog and fixture viewer client. Tests cover paging cursor preservation, title episodes, progress, the signed playback and download contracts, and foreign or mismatched grant rejection.

**AUD-07 native fixture sessions:** [PR #15](https://github.com/Vertex-Systems-Network/series-viral-box/pull/15) verifies opt-in loopback sign-in, isolated bearer sessions, viewer progress, expiration and logout revocation. Production native identity and device acceptance remain open.

**AUD-07 native media fixture:** [PR #16](https://github.com/Vertex-Systems-Network/series-viral-box/pull/16) exercises native login, real HLS and MP4 decoding, byte ranges, progress and grant rejection after logout. Run `node --test scripts/media-delivery.test.mjs`. The Media playback workflow runs the same fixture checks.

**AUD-07 Expo harness:** [PR #17](https://github.com/Vertex-Systems-Network/series-viral-box/pull/17) adds a development-only Expo app for native login, HLS playback, saved position, and temporary MP4 verification. Device setup and acceptance steps are in the root README.

**Next executable task:** Run the Expo fixture on an Android emulator or USB development device and an iOS simulator. The current workspace lacks Android SDK tooling and the iOS simulator. Continue independent workspace bootstrap work while device acceptance is blocked.

**External dependencies:** Licensed provider inventories and distribution rights, deployable public HTTPS origin, Google/Apple credentials, configured sender and CDN/bucket access. Review [AUDIT.md](AUDIT.md) before any production release.

**P0-01 infrastructure checkpoint:** [PR #18](https://github.com/Vertex-Systems-Network/series-viral-box/pull/18) defines the local PostgreSQL, Redis and object storage setup and its CI round trips. Continue workspace tooling and service-shell acceptance separately. Docker is unavailable in this environment, so the live stack is checked in Actions.


**P0-01 workspace checkpoint:** [PR #19](https://github.com/Vertex-Systems-Network/series-viral-box/pull/19) adds the root pnpm workspace and frozen lock. It preserves the standalone Expo harness lock. Once merged with passing clean-install CI, return to the next ready non-design backlog task and retain device acceptance as a separate gate.

**P0-02 pilot qualification:** [PR #20](https://github.com/Vertex-Systems-Network/series-viral-box/pull/20) records the fixture and `reelfren/anamana` pilot candidate and checks independent inventory, limits, media and rights evidence. The current candidate is blocked on an authoritative inventory, provider limits, approved media and distribution rights. The report command is `node scripts/pilot-readiness.mjs`. Use `--require-ready` at the live pilot gate.
