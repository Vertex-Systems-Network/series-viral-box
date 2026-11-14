# Local fixture media packaging

Install FFmpeg with libx264. Run `node scripts/package-media.mjs /path/to/local-fixture.mp4 /path/to/output`. Use local fixture media or media you have permission to process. The command produces HLS VOD, MP4 and a relative-path manifest in a checksum-named directory, then prints its path. It stages conversion and publishes via directory rename. This is the local packaging step for P3-01. Queue, object storage, database registration and rights checks are tracked under P3-01 and P3-02.

After importing the fixture catalog, set DATABASE_URL and run `node apps/worker/register-fixture-media.mjs DIRECTORY demo-series en demo-1`. This verifies the package checksum and segment presence and records the fixture episode and asset checksum in PostgreSQL. Repeated registration is idempotent.

## Publish fixture assets to object storage

Use AWS CLI credentials scoped to a private fixture bucket. Set DATABASE_URL and FIXTURE_MEDIA_BUCKET. Set FIXTURE_S3_ENDPOINT when using an S3-compatible endpoint. Initialize the fixture schema and episode through the fixture catalog command first, then run `node apps/worker/publish-fixture-media.mjs DIRECTORY demo-series en demo-1`.

Publication writes into an attempt-specific object prefix and sets available_at only after every upload succeeds. Repeated publication to the same bucket returns the existing prefix. On upload failure, the worker attempts to remove that attempt's objects. If the database result is ambiguous, objects are retained for reconciliation because the database may have already published that prefix. Use the storage_bucket and storage_prefix fields to identify published objects. This fixture command does not grant public access.
