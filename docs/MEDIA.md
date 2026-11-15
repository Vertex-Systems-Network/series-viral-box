# Local fixture media packaging

Install FFmpeg with libx264. Run `node scripts/package-media.mjs /path/to/local-fixture.mp4 /path/to/output`. Use local fixture media or media you have permission to process. The command produces HLS VOD, MP4 and a relative-path manifest in a checksum-named directory, then prints its path. It stages conversion and publishes via directory rename. This is the local packaging step for P3-01. Queue, object storage, database registration and rights checks are tracked under P3-01 and P3-02.

After importing the fixture catalog, set DATABASE_URL and run `node apps/worker/register-fixture-media.mjs DIRECTORY demo-series en demo-1`. This verifies the package checksum and segment presence and records the fixture episode and asset checksum in PostgreSQL. Repeated registration is idempotent.

## Publish fixture assets to object storage

By default the publisher writes to local disk under ./var/media or FIXTURE_MEDIA_DIR. Set DATABASE_URL. For optional S3 uploads, set FIXTURE_MEDIA_BUCKET and use AWS CLI credentials scoped to a private fixture bucket. Set FIXTURE_S3_ENDPOINT when using an S3-compatible endpoint. Initialize the fixture schema and episode through the fixture catalog command first, then run `node apps/worker/publish-fixture-media.mjs DIRECTORY demo-series en demo-1`.

Publication writes into an attempt-specific object prefix and sets available_at only after every upload succeeds. Repeated publication to the same bucket returns the existing prefix. On upload failure, the worker attempts to remove that attempt's objects. If the database result is ambiguous, objects are retained for reconciliation because the database may have already published that prefix. Use the storage_bucket and storage_prefix fields to identify published objects. This fixture command does not grant public access.

## Configure optional CDN delivery

After schema initialization, set DATABASE_URL and MEDIA_ADMIN_TOKEN and run `node apps/worker/media-admin.mjs`. The service listens on loopback port 3101 by default. Send an authenticated GET or PUT to /admin/media-settings. PUT accepts a JSON body such as `{"cdnBaseUrl":"https://cdn.example.com/media/"}` or `{"cdnBaseUrl":null}` to clear it. Configure the CDN origin with your CDN provider. This setting passes the delivery base to the grant signer. It does not provision DNS, upload credentials, or a CDN distribution. Local signed serving is available below. CDN-backed signing still requires a configured CDN signer and origin. The HLS grant requests prefix scope for its playlist and segments. MP4 requests exact-object scope.

## Deliver fixtures through a private origin

Start `node apps/worker/fixture-origin.mjs` with `FIXTURE_MEDIA_DIR`, `MEDIA_SIGNING_KEY` and a separate `FIXTURE_ORIGIN_TOKEN` of at least 32 bytes. The origin binds to loopback on port 3102 by default. Use the same absolute media path and signing key as the fixture publisher and grant service. Expose the origin only through private connectivity or a trusted tunnel.

Configure the CDN route to strip its delivery prefix, forward the full signed fixture path and Range header, and inject `X-Fixture-Origin-Token` from CDN-side secret configuration. Overwrite any incoming value of that header. Disable caching and compression for this route so each request reaches the signature check and byte lengths remain accurate. The private origin requires both the CDN token and a current, correctly scoped signature.

Set the HTTPS `FIXTURE_CDN_BASE_URL` on the loopback media-admin service to enable same-origin proxying. Set it to the CDN delivery prefix, for example `https://cdn.example.com/delivery/`. Viewer and admin grants still reference the application's fixture path. The app forwards only the media method and range metadata, keeps viewer cookies and credentials local, and rejects upstream redirects. The database CDN setting remains metadata for signer integrations. The proxy destination comes from server configuration.

`node --test scripts/media-delivery.test.mjs` decodes HLS and MP4 through both local and CDN fixture paths. It checks HEAD, ranges, scoped signatures, anonymous origin rejection, and credential isolation through a local CDN stand-in. Live delivery still needs configured CDN and private origin access, including access to the fixture assets. This route implements the fixture grant contract and has no production account or rights checks at the origin.

## Serve local fixture media

Set MEDIA_SIGNING_KEY to a secret of at least 32 bytes and start the loopback media admin service. With an admin bearer token, POST to `/admin/fixture-grant?titleId=demo-series&locale=en&episodeId=demo-1&kind=playback`. Use kind=download for the MP4 attachment. Resolve the returned relative URL against the media service origin. HLS segments use the same signed path prefix as the playlist. The media route supports GET, HEAD and single byte ranges. The local signer applies only to assets published to the configured local disk directory.

Run the full local media smoke test with `node --test scripts/media-delivery.test.mjs` after installing dependencies and FFmpeg. It packages generated video, publishes it to disk, registers the storage location in embedded PostgreSQL, resolves grants, and decodes HLS and MP4 over HTTP.

## Web blob playback

The reusable web adapter is `attachBlobPlayback(video, Hls, grantUrl)` in apps/web/blob-playback.mjs. Pass a client-side hls.js constructor and the signed same-origin playback grant. Call the returned cleanup when leaving the page or switching episodes. The adapter requires MediaSource blob attachment and reports unsupported browsers or fatal HLS errors. Its current path contract is the local fixture route. Keep the upstream provider and object-storage URLs server-side. Browser networking can still show the app's temporary playlist and segment requests. The download grant remains a separate MP4 attachment.

Run `node --test apps/web/blob-playback.test.mjs scripts/media-delivery.test.mjs`. This verifies adapter behavior with a test double and HTTP decoding with FFmpeg. The production watch-page integration, real browser MSE test, and CDN-backed same-origin route remain pending.

## Fixture watch page

Start the signed local media service and get a playback grant with the authenticated admin endpoint. Open `/fixture-watch#grant=ENCODED_GRANT` on the same service, encoding the relative grant with URLSearchParams or encodeURIComponent. hls.js is served locally. The fragment keeps the grant out of the watch page HTTP request. Run `node scripts/fixture-watch-smoke.mjs --http-only` to check the route and assets, or run without the flag for Chromium playback. For browser mode use `npx playwright install chromium` or set CHROMIUM_BIN to an installed Chromium.
