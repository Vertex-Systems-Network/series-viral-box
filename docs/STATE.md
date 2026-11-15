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

**Integrated verification:** 23 worker tests, four media/continuation tests, HTTP fixture smoke, registry baseline, Next.js production build, and NestJS/Next.js HTTP parity passed together. Run `npm ci` then `npm test` and the parity commands below to reproduce the checkpoint.

**Next executable task:** Continue AUD-07 from [PR #11](https://github.com/Vertex-Systems-Network/series-viral-box/pull/11). Figma v0.1 contains seven editable frames. Run `npm ci`, `npm run -w @series-viral-box/web build` and `node --test scripts/platform-parity.test.mjs` to reproduce the read-only baseline. Use [DESIGN.md](DESIGN.md) to verify mobile, native and admin interactions and additional states before the remaining UI migration. Promote shared route contracts before starting Expo. Recheck any live claim before adding a branch.

**External dependencies:** Licensed provider inventories and distribution rights, deployable public HTTPS origin, Google/Apple credentials, configured sender and CDN/bucket access. Review [AUDIT.md](AUDIT.md) before any production release.

**Active claim:** AUD-07 viewer API transport parity on `codex/aud-07-viewer-routes`.
