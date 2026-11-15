# Candidate source inventory

All entries are discovery candidates. Production catalog/export contracts and rights remain unverified. Each connector qualification must record source URL, IDs and paging, incremental update method, format, evidence date, supported regions, ingest/export permissions, and account or rate limits. Credentials and temporary URLs belong outside Git.

## ReelFren directory (53)

- Anamana
- AniBoy
- Melolo
- Sereal+
- PineDrama
- Shorten
- HappyShort
- Vigloo
- Vigloo 2
- RapidTV
- RapidTV 2
- RaptDrama
- CubeTV
- JoyReels
- AnyReel
- Shortical
- StoReel
- LoveShots
- MomeShort
- MoreShort
- ToonShort
- SixthShort
- SoReel
- StoryGo
- MiniShort
- WinkNovel
- My Muse
- SarosTV
- ReelAI
- Reelife
- ReelShort
- ReelShort 2
- DramaBox
- DramaWave
- DramaNova
- KalosTV
- VibeShort
- FreeReels
- WeTV
- StoryReel
- MovieBox Shorts
- BonusTV
- MoboReels
- NetShort
- MyDrama
- FlareFlow
- PlayLet
- ShortMax
- FlexTV
- FlexTV 2
- CandyJar
- BlinkDrama
- iQIYI

## DramaFren provider roots (19)

Root HTTP results from the initial environment. A 200 confirms reachability of a page. A 403 leaves the player and catalog unverified.

- https://dramabox.dramafren.org/ — 403
- https://dramaboxv2.dramafren.org/ — 403
- https://goodshort.dramafren.org/ — 403
- https://netshort.dramafren.org/ — 403
- https://flickreels.dramafren.org/ — 403
- https://stardusttv.dramafren.org/ — 403
- https://dramawave.dramafren.org/ — 403
- https://shortmax.dramafren.org/ — 403
- https://reelshort.dramafren.org/ — 403
- https://idrama.dramafren.org/ — 403
- https://flextv.dramafren.org/ — 200
- https://starshort.dramafren.org/ — 403
- https://kalostv.dramafren.org/ — 403
- https://dramabite.dramafren.org/ — 403
- https://dramapops.dramafren.org/ — 200
- https://microdrama.dramafren.org/ — 403
- https://shortwave.dramafren.org/ — 403
- https://tvseries.dramafren.org/ — 403
- https://moboreels.dramafren.org/ — 403

The [v2 site](https://v2.dramafren.org/) has separate editorial watch pages and a paginated DramaBox catalog. Qualify these paths independently. Treat numerical provider variants as separate source records pending identity verification.

## Additional discovery candidates

| Candidate | Observed | Next verification |
| --- | --- | --- |
| [Where to Watch Drama](https://wheretowatchdrama.com/en/platforms) | Multi-platform directory with title summaries and official or partner viewing links. | Check provider inventory, permitted metadata use, update method and title coverage. |
| [DramaBos provider directory](https://www.dramabos.live/providers/) | Lists short-drama platforms and API availability. | Check operator, provenance, access terms, usable contracts and redistribution scope independently. |
| Official provider sites and app stores | Primary route for confirming product, publisher, region, and official catalog or partnership contact. | Map an official URL and evidence date to each discovered provider. |

Treat the registry as open-ended. Track discovery, identity verification, feed qualification, metadata sync, and media eligibility per source. Measure coverage against the known inventory and record unknown or unavailable coverage explicitly. Discover new provider listings on a recurring review and enqueue qualification before enabling an import.

## Registry commands

The machine-readable seed is [data/source-registry.json](../data/source-registry.json). Run `node scripts/source-registry.mjs check data/source-registry.json` to validate it. To queue reviewed discoveries, provide a JSON array of objects with `source`, `key`, `label` and `url`, then run `node scripts/source-registry.mjs merge data/source-registry.json candidates.json` from one working copy. Existing identities and their status are preserved. New entries enter as discovered. Inspect the diff before committing.

## Inventory coverage

The original registry is pinned in [required-sources.json](../data/required-sources.json). Public navigation review on 2026-11-14 also found ShotShort ([DramaPops navigation](https://dramapops.dramafren.org/)), iDrama2 ([indexed iDrama navigation](https://idrama.dramafren.org/index.php?id=100000641927&page=detail)), and RadReel ([DramaFren v2 notice](https://v2.dramafren.org/)). For iDrama2 and RadReel the registered URL is where the name was observed. Their own endpoints and episode inventories need verification.

Run `node scripts/catalog-coverage.mjs` for the registry baseline. The report lists discovery roots separately. They count toward registry presence and are excluded from provider coverage and inventory imports.

Run `node scripts/catalog-coverage.mjs expected.json imported.json [--media media.json]` for the provider inventory gate. Version 2 snapshots have an `inventories` array with one row per source and locale. Each row includes `source`, `locale`, `titles` (objects with `titleId`) and `episodes` (objects with `titleId` and `episodeId`). Expected rows also carry `scope` (`partial` or `authoritative`) and `evidence` with a `reference` to the inventory export or traversal record and an ISO UTC `observedAt` timestamp. Use authoritative scope only for an independently verified complete inventory for that locale. Legacy arrays are accepted as partial evidence. The gate requires an authoritative match for each registered provider within its assessed locales and reports missing titles and episodes separately. Unassessed locales remain outside the result.

Optional media input is an array of episode evidence rows containing `source`, `locale`, `titleId`, `episodeId`, `assetVersion`, `playable`, `downloadable` and `evidence` in the same reference/timestamp form. Use delivery verification records as evidence. Keep credentials and signed URLs out of snapshots. The report counts playable, downloadable and unknown episodes independently of the catalog gate.

## Directory reconciliation, 2026-11-14

The registry retains the 53 user-listed ReelFren entries, 19 DramaFren provider roots, two v2 catalog paths, and three subsequently observed DramaFren candidates. It also records all 42 rows in the public [DramaBos directory](https://www.dramabos.live/providers/) and all 18 cards in the English [Where to Watch Drama directory](https://wheretowatchdrama.com/en/platforms) as individual source/provider pairs. Directory URLs are discovery evidence. DramaShorts and DreameShort are listed by the guide with catalog imports pending. All 139 source identities, including the two directory roots, are pinned in the required baseline.

Keep matching app names separately under each directory. Cross-source matching needs verified provider and episode identifiers. Regional catalogs, unlisted providers, full episode inventories and media availability require independent verification. A directory record with status discovered signifies provider presence only.

## Compare live DB imports

After installing dependencies, run `DATABASE_URL=... node scripts/catalog-coverage.mjs expected.json --db`. The imported side is read from PostgreSQL in one query and includes titles with no imported episodes. Live adapters must use the exact registry source/key value as their source, and keep upstream title ID, episode ID and locale stable. The expected side must come from an independent upstream inventory. A homepage or trending feed is partial. DramaBos documents paginated episode lists per title and curated title feeds, so it is a candidate for a partial pilot. Its public documentation does not establish exhaustive title enumeration or a durable incremental cursor.

- [DramaBos title feeds](https://www.dramabos.live/docs/feed-api/)
- [DramaBos episode listing](https://www.dramabos.live/docs/episodes-api/)

## Import provider inventory snapshots

Run `DATABASE_URL=... node apps/worker/run.mjs --inventory snapshot.json` with a version 1 JSON object containing `source` (an exact registry source/key) and `titles`. Each title supplies `id`, `locale`, `name`, `synopsis` and `episodes`. Each episode supplies `id`, `number` and `name`. Import commits pages of 100 titles. If interrupted, resume with the original bytes. A changed file fails the saved checkpoint check. This tool upserts catalog records and preserves existing episodes omitted by the snapshot. Use an independently obtained expected inventory for the coverage check.

### ReelFren Anamana public catalog collector

Run `node scripts/collect-anamana.mjs snapshot.json` to collect up to 20 English titles from the public sitemap. Pass an optional title limit to sample a smaller set. The collector checks the public watch-page episode numbers against each detail page's declared count and fails the snapshot if any selected title cannot be reconciled. Import the resulting JSON with `node apps/worker/run.mjs --inventory snapshot.json` and a configured DATABASE_URL. Treat the snapshot as partial provider coverage. Episode identities use ReelFren's displayed episode numbers scoped to the title and locale.

### DramaFren v2 DramaBox public title collector

Run `node scripts/collect-dramafren-v2.mjs snapshot.json [PAGE_LIMIT]` (default two pages). It follows the public Next link and deduplicates titles by upstream ID and locale. Import with the existing snapshot command. The snapshot retains declared episode counts for audit. The DB importer currently persists title metadata only for this source because the catalog cards do not identify individual episodes. Keep expected episode inventory unknown pending an independently verified listing.

### ReelFren selected titles across providers

Run `node scripts/collect-reelfren.mjs snapshot.json PROVIDER TITLE_URL [...]`. Use the registered provider key and English ReelFren detail URLs from a single provider per snapshot. Validated routes include SixthShort and Sereal+ (registry key sereal-plus maps to route sereal). The collector shares series and episode validation with the Anamana sitemap command. Selected titles are partial provider coverage. Provider IDs with a different route or identifier format require qualification.

### Discover ReelFren title URLs

Run `node scripts/discover-reelfren.mjs discovery.json`. The command reads public English Explore links and records each registered provider's browse URL and deduplicated title links. It records unmapped provider routes for review and retains titles with nonnumeric IDs as links requiring adapter validation. Use numeric-ID title URLs with the selected-title collector where the provider route is supported. Global Explore is a partial snapshot. Providers with no title links in that snapshot remain unknown.

### Scan provider browse pages

Run `node scripts/discover-reelfren.mjs discovery.json aniboy vigloo dramanova iqiyi` to extend a fresh Explore manifest with selected providers, or pass `--all` to attempt each registered provider's initial browse page sequentially. The manifest preserves global results and records the status and added titles per attempted provider. Failed requests are reported in the saved manifest and set a nonzero exit status. An empty public browse page leaves inventory unknown.

Run `node scripts/collect-reelfren.mjs snapshot.json sixthshort --manifest discovery.json 1` to collect the first supported numeric-ID title for a provider. The limit is explicit and accepted from 1 to 100. The CLI also continues to accept explicit title URLs. Results cover the initial public pages and selected titles. Treat them as partial while pagination, other feeds, or regions are unverified.

## Live pilot qualification

Use `node scripts/pilot-readiness.mjs` to report the selected provider and its inventory, rate-limit, media, and distribution-rights evidence. For release checks, add `--require-ready` to require four separately verified gates and a qualified registry entry.

The development source is `fixture`. The first tracked candidate is `reelfren/anamana` because the repository already has a collector and documented catalog sample. The sample is partial. The candidate still requires an authoritative inventory, documented rate limits, approved reusable media, and explicit distribution rights. Add dated review references once those are verified. Keep credentials, signed URLs and confidential agreements out of this public repository.
