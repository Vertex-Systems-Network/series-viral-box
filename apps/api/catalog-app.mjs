import 'reflect-metadata';
import { All, Controller, Module, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { catalogResponse } from '../worker/catalog-api.mjs';

export async function createCatalogApp(db) {
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
  return NestFactory.create(CatalogModule, { logger: false, abortOnError: false });
}
