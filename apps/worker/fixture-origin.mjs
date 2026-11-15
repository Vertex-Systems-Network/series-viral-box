import { createServer } from 'node:http';
import { createPrivateFixtureOrigin } from './fixture-cdn.mjs';
import { createLocalMedia } from './local-media.mjs';

const { FIXTURE_MEDIA_DIR = './var/media', MEDIA_SIGNING_KEY, FIXTURE_ORIGIN_TOKEN,
  FIXTURE_ORIGIN_PORT = '3102' } = process.env;
const serve = createPrivateFixtureOrigin(createLocalMedia(FIXTURE_MEDIA_DIR, MEDIA_SIGNING_KEY),
  FIXTURE_ORIGIN_TOKEN);
createServer((request, response) => {
  void serve(request, response).catch(() => {
    if (response.headersSent) response.destroy();
    else response.writeHead(500).end();
  });
}).listen(Number(FIXTURE_ORIGIN_PORT), '127.0.0.1');
