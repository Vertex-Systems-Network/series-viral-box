# Current project handoff

Baseline is [main at `d5e0dd9`](https://github.com/Vertex-Systems-Network/series-viral-box/commit/d5e0dd9e296d5db84954d2803a17b21309f621c2). Use [BACKLOG.md](BACKLOG.md) for task status, [AUDIT.md](AUDIT.md) for acceptance gaps, and [PLAN.md](PLAN.md) for architecture. Review open PRs before starting work.

| Area | Verified checkpoint |
| --- | --- |
| Workspace | Local PostgreSQL, Redis and private S3 round trips, then a frozen pnpm clean install. [Infrastructure CI](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43671942781) · [pnpm CI](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43672246272) |
| Viewer and media | NestJS viewer and Next.js same-origin transport. Chromium covers recovery, progress and fixture playback. Native loopback login and signed HLS/MP4 decode passed CI. [Viewer CI](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43667278081) · [Native media CI](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43669682055) |
| Expo | Android and iOS JavaScript exports pass. Device playback, interruption and download verification require an emulator or device. [Expo CI](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43671664477) |
| Providers | Fixture sync is verified. The selected live candidate `reelfren/anamana` is blocked on authoritative inventory, documented limits, approved media and distribution rights. [Registry CI](https://github.com/Vertex-Systems-Network/series-viral-box/actions/runs/43672424811) |

## Resume

**Active task:** P1-01 is claimed in [draft PR #21](https://github.com/Vertex-Systems-Network/series-viral-box/pull/21). Continue on `codex/p1-01-episode-rights`. Add the next SQL migration for episode distribution rights and test provider identity, locale isolation and window expiry with synthetic data. Run `pnpm install --frozen-lockfile`, `pnpm test`, and verify Catalog sync CI. Preserve previously applied migrations. The latest local worktree operation was blocked by a tool approval usage limit, so implementation and verification of this task are pending.

After P1-01 merges, check the backlog for P1-02 API contract generation and P2-01 sync semantics. The Figma/design track is outside the current implementation loop. Live release and actual device validation stay open until their external dependencies are available.
