import 'reflect-metadata';
import { All, Controller, Module, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createViewerRoutes } from '../worker/viewer-routes.mjs';
import { serveFixtureWatch } from '../worker/fixture-watch-routes.mjs';
import { catalogResponse } from '../worker/catalog-api.mjs';

export async function createCatalogApp(db, options = {}) {
  class CatalogController {
    async handle(request, outgoing) {
      const url = new URL('http://localhost' + request.originalUrl);
      const result = await catalogResponse(db, url, request.method);
      if (!result) return outgoing.status(404).end();
      outgoing.status(result.status);
      for (const [name, value] of result.headers) outgoing.setHeader(name, value);
      return outgoing.end(Buffer.from(await result.arrayBuffer()));
    }
  }
  Req()(CatalogController.prototype, 'handle', 0);
  Res()(CatalogController.prototype, 'handle', 1);
  All(['providers', 'titles', 'title'])(CatalogController.prototype, 'handle',
    Object.getOwnPropertyDescriptor(CatalogController.prototype, 'handle'));
  Controller('v1')(CatalogController);

  class CatalogModule {}
  Module({ controllers: [CatalogController] })(CatalogModule);
  const app = await NestFactory.create(CatalogModule, { logger: false, abortOnError: false, bodyParser: false });
  const { handleViewer, local } = createViewerRoutes(db, {
    ...options,
    localOrigin: () => 'http://127.0.0.1:' + app.getHttpServer().address().port,
  });
  app.use(async (incoming, outgoing, next) => {
    try {
      const url = new URL('http://localhost' + incoming.originalUrl);
      if (url.pathname.startsWith('/admin/')) return next();
      if (await handleViewer(incoming, outgoing, url)) return;
      if (await serveFixtureWatch(incoming, outgoing, url.pathname, Boolean(local))) return;
      return next();
    } catch {
      if (outgoing.headersSent) return outgoing.destroy();
      return outgoing.writeHead(500).end();
    }
  });
  return app;
}
