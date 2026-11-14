# Local fixture media packaging

Install FFmpeg with libx264. Run `node scripts/package-media.mjs /path/to/local-fixture.mp4 /path/to/output`. Use local fixture media or media you have permission to process. The command produces HLS VOD, MP4 and a relative-path manifest in a checksum-named directory, then prints its path. It stages conversion and publishes via directory rename. This is the local packaging step for P3-01. Queue, object storage, database registration and rights checks are tracked under P3-01 and P3-02.
