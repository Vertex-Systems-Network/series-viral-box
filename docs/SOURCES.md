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

Run `node scripts/catalog-coverage.mjs` for the registry baseline check. For an inventory gate, run `node scripts/catalog-coverage.mjs expected.json imported.json`. Both files contain arrays of source records with `source` (registry source/key) and `episodes` (objects with titleId, locale and episodeId). Each expected record also supplies a boolean `complete`. Set it true only after an authoritative inventory traversal. The gate reports unknown and partial inventories and identifies missing episodes. Passing this gate establishes catalog coverage for the supplied snapshots. Media verification needs separate evidence that each expected episode has a playable object and, where available, a downloadable rendition.

## Directory reconciliation, 2026-11-14

The registry retains the 53 user-listed ReelFren entries, 19 DramaFren provider roots, two v2 catalog paths, and three subsequently observed DramaFren candidates. It also records all 42 rows in the public [DramaBos directory](https://www.dramabos.live/providers/) and all 18 cards in the English [Where to Watch Drama directory](https://wheretowatchdrama.com/en/platforms) as individual source/provider pairs. Directory URLs are discovery evidence. DramaShorts and DreameShort are listed by the guide with catalog imports pending. All 139 source identities, including the two directory roots, are pinned in the required baseline.

Keep matching app names separately under each directory. Cross-source matching needs verified provider and episode identifiers. Regional catalogs, unlisted providers, full episode inventories and media availability require independent verification. A directory record with status discovered signifies provider presence only.

## Compare live DB imports

After installing dependencies, run `DATABASE_URL=... node scripts/catalog-coverage.mjs expected.json --db`. The imported side is read from PostgreSQL in one query. Live adapters must use the exact registry source/key value as their source, and keep upstream title ID, episode ID and locale stable. The expected side must come from an independent upstream inventory. A homepage or trending feed is partial. DramaBos documents paginated episode lists per title and curated title feeds, so it is a candidate for a partial pilot. Its public documentation does not establish exhaustive title enumeration or a durable incremental cursor.

- [DramaBos title feeds](https://www.dramabos.live/docs/feed-api/)
- [DramaBos episode listing](https://www.dramabos.live/docs/episodes-api/)

## Import provider inventory snapshots

Run `DATABASE_URL=... node apps/worker/run.mjs --inventory snapshot.json` with a version 1 JSON object containing `source` (an exact registry source/key) and `titles`. Each title supplies `id`, `locale`, `name`, `synopsis` and `episodes`. Each episode supplies `id`, `number` and `name`. Import commits pages of 100 titles. If interrupted, resume with the original bytes. A changed file fails the saved checkpoint check. This tool upserts catalog records and preserves existing episodes omitted by the snapshot. Use an independently obtained expected inventory for the coverage check.
