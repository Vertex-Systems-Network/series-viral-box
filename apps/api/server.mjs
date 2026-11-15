import pg from 'pg';
import { createCatalogApp } from './catalog-app.mjs';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting the catalog API');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const app = await createCatalogApp(db);
  await app.listen(Number(process.env.CATALOG_API_PORT ?? 3103), '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await app.close();
      await db.end();
    });
  }
} catch (error) {
  await db.end();
  throw error;
}
