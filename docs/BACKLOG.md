# Delivery backlog

This table is the source of truth for task status. GitHub issues can mirror tasks by ID. Select ready tasks in phase order subject to dependencies. Parallel work is allowed when dependencies and touched contracts are independent. Statuses: Ready, Planned, In progress, Blocked, In review, Done. Planned becomes Ready once dependencies are met. Done requires merged evidence. Phase gates are satisfied when their required tasks are Done. Splitting tasks retains the parent ID and gate.

| ID | Status | Depends on | Deliverable and acceptance evidence |
| --- | --- | --- | --- |
| P0-01 | Ready | Planning PR merged | Bootstrap pnpm workspace, service shells, local Postgres/Redis/object storage, env example and CI. New checkout starts from documented commands. |
| P0-02 | Ready | Planning PR merged | Register all supplied ReelFren and DramaFren variants with audit status. Select fixture source and track one live source with inventory, rate limits, media and rights evidence. Fixture work can proceed independently. |
| P1-01 | Planned | P0-01 | Create schema/migrations and seed fixtures. Prove identity uniqueness, locale variants and rights expiry. |
| P1-02 | Planned | P1-01 | Implement catalog REST API and generated clients. Verify cursor pagination, provider filters and contract generation. |
| P2-01 | Planned | P1-01 | Build adapter interface and fixture backfill/incremental sync. Verify transaction, checkpoint recovery and deletion handling. |
| P2-02 | Planned | P2-01 | Add source health, admin resync, contract drift detection, rate-limit retries and incomplete-run protection. |
| P3-01 | Planned | P2-01 | Build on the verified local fixture packaging command to add ingest worker and storage pipeline. Verify HLS + MP4 output, atomic publish and idempotent retries. |
| P3-02 | Planned | P3-01, P1-02 | Implement playback and download grants. Verify permissions, expiration, removed titles and a failed replacement. |
| P4-01 | Ready | Planning PR merged | Design AI finishes responsive web, mobile and admin spec and records visual QA acceptance. |
| P4-02 | Planned | P4-01, P1-02 | Implement web catalog, detail and search against shared API. Verify responsive layouts and keyboard navigation. |
| P4-03 | Planned | P4-02, P3-02 | Implement web player/download and admin sync/asset pages. Verify complete fixture flow and failure states. |
| P5-01 | Planned | P4-01, P1-02 | Implement native navigation, catalog and details. Verify iOS and Android layouts. |
| P5-02 | Planned | P5-01, P3-02 | Implement native playback and file download behavior per product decision. Verify device permissions, interruptions and unavailable states. |
| P6-01 | Planned | P2-02, P4-03, P5-02, validated live source | Run a complete live-source series pilot. Demonstrate backfill, new episode auto-publish, source failure recovery, playback and permitted download. |
| P6-02 | Planned | P6-01 | Verify release, restore and rollback. Record operating budget, support owner and target launch coverage. |
| P7-01 | Planned | P6-02 | Roll out additional production connectors one at a time. Require per-source evidence and verify cross-source deduplication. |
| P7-02 | Planned | P0-02 | Inventory all known apps and comparable websites. Verify official publisher/site mappings, preserve cross-site provenance, and report duplicates and coverage gaps. |
| P7-03 | Planned | P7-02, P2-02 | Add recurring discovery and qualification queue. Verify a new provider listing creates one pending record, review can enable metadata-only sync, and playable/downloadable counts are reported separately. |
| P0-03 | In review | Local Node.js workspace | Manually launched continuation supervisor. Separate task processes share leases and durable state. Pause, resumption and blocked dependency isolation tested. AI scheduling is excluded in this chat. |

## Post-audit execution queue

Use this queue for current task selection. The phase table above defines delivery gates. Fixture completion does not close a production phase. Draft work remains in review until merged.

| ID | Status | Dependency | Acceptance evidence |
| --- | --- | --- | --- |
| AUD-01 | In review | Local account APIs | Extend Chromium coverage to request and consume reset and verification links via a test mail transport. Verify revoked session and visible verified status. |
| AUD-02 | In review | Local media pipeline | Specify and test production playback/download entitlement, disabled viewer behavior, territory/window checks, and existing grant expiry/revocation. |
| AUD-03 | In review | Fixture schema | Introduce versioned migrations and test clean DB plus upgrade of existing catalog/account/asset records. |
| AUD-04 | In review | OAuth callback code, AUD-03 migrations | Test successful and rejected token exchange with fixtures, then implement explicit authenticated linking. Live provider test needs HTTPS and real credentials. |
| AUD-05 | In review | Registry and coverage tool | Separate discovery roots and actual provider inventories, track per-locale expected IDs and evidence, and compare catalog and media availability separately. Live completeness needs upstream exports. |
| AUD-06 | In review | Local storage and CDN settings | Add CDN delivery integration and test against a private fixture origin. Live verification needs configured CDN and bucket. |
| AUD-07 | In progress | Target architecture | Finalize design spec and move fixture UI/API toward Next.js and NestJS with contract parity. Start Expo after shared contracts are stable. |
| AUD-08 | In review | Account recovery APIs, migration runner | Add durable mail delivery, signed-in profile/password/session controls, admin UI and audit events. Live delivery needs configured sender. |

Draft pull requests, integrated test evidence, and the next action are in [STATE.md](STATE.md).

AUD-07 is continuing in the design handoff draft on `codex/aud-07-design-handoff`.

## Task card

ID and goal · dependencies · owner/role and PR · scope and affected contracts · acceptance checks · evidence · blocker and next action.
