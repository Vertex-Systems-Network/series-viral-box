import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { createMailOutbox } from './account-mail-outbox.mjs';
import { resetMailer } from './reset-mail.mjs';

const { DATABASE_URL, MAIL_OUTBOX_KEY } = process.env;
const deliver = resetMailer(process.env);
if (!DATABASE_URL || !deliver) {
  throw new Error('Configure DATABASE_URL, HTTPS AUTH_PUBLIC_ORIGIN, SENDMAIL_PATH and RESET_MAIL_FROM');
}
const outbox = createMailOutbox(MAIL_OUTBOX_KEY);
const db = new pg.Pool({ connectionString: DATABASE_URL });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopping = true; });
try {
  while (!stopping) {
    const outcome = await outbox.dispatch(db, deliver);
    if (outcome === 'retry') console.error('Account mail transport failed; retry scheduled.');
    if (outcome === 'idle') await setTimeout(1000);
  }
} finally {
  await db.end();
}
