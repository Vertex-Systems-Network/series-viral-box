import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function activeToken(alias) {
  return `EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = ${alias}.user_id AND NOT u.disabled AND
      ((${alias}.purpose = 'reset' AND EXISTS (
        SELECT 1 FROM password_reset r WHERE r.user_id = u.id AND r.token_hash = ${alias}.token_hash AND r.expires_at > now()
      )) OR (${alias}.purpose = 'verify' AND u.email_verified_at IS NULL AND EXISTS (
        SELECT 1 FROM email_verification v WHERE v.user_id = u.id AND v.token_hash = ${alias}.token_hash AND v.expires_at > now()
      )))
  )`;
}

export function createMailOutbox(hexKey) {
  if (typeof hexKey !== 'string' || !/^[a-f0-9]{64}$/i.test(hexKey)) {
    throw new Error('MAIL_OUTBOX_KEY must contain 32 bytes encoded as hex');
  }
  const key = Buffer.from(hexKey, 'hex');
  return {
    async enqueue(db, purpose, upsert, parameters, email, link) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(Buffer.from(purpose + ':' + parameters[1]));
      const payload = Buffer.concat([cipher.update(JSON.stringify({ email, link })), cipher.final()]);
      const encrypted = Buffer.concat([nonce, cipher.getAuthTag(), payload]).toString('base64');
      await db.query(`WITH saved AS (${upsert})
        INSERT INTO account_mail_outbox (token_hash, user_id, purpose, encrypted_payload, expires_at)
        SELECT token_hash, user_id, $3, $4, expires_at FROM saved`, [...parameters, purpose, encrypted]);
    },

    async dispatch(db, deliver) {
      await db.query(`DELETE FROM account_mail_outbox o WHERE o.expires_at <= now() OR NOT ${activeToken('o')}`);
      const { rows: [job] } = await db.query(`WITH due AS (
        SELECT token_hash FROM account_mail_outbox WHERE next_attempt_at <= now()
        ORDER BY next_attempt_at, token_hash LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE account_mail_outbox o SET next_attempt_at = now() + interval '1 minute',
        attempts = attempts + 1 FROM due WHERE o.token_hash = due.token_hash
        RETURNING o.token_hash, o.purpose, o.encrypted_payload, o.attempts`);
      if (!job) return 'idle';

      const args = [job.token_hash, job.attempts];
      const { rows: [active] } = await db.query(`SELECT 1 FROM account_mail_outbox o
        WHERE o.token_hash = $1 AND o.attempts = $2 AND o.expires_at > now() AND ${activeToken('o')}`, args);
      if (!active) {
        await db.query('DELETE FROM account_mail_outbox WHERE token_hash = $1 AND attempts = $2', args);
        return 'discarded';
      }

      try {
        const encoded = Buffer.from(job.encrypted_payload, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, encoded.subarray(0, 12));
        decipher.setAAD(Buffer.from(job.purpose + ':' + job.token_hash));
        decipher.setAuthTag(encoded.subarray(12, 28));
        const { email, link } = JSON.parse(Buffer.concat([decipher.update(encoded.subarray(28)), decipher.final()]));
        await deliver(email, link, job.purpose);
      } catch {
        const delaySeconds = Math.min(30 * 2 ** (job.attempts - 1), 300);
        await db.query(`UPDATE account_mail_outbox SET next_attempt_at = now() + $3 * interval '1 second'
          WHERE token_hash = $1 AND attempts = $2`, [...args, delaySeconds]);
        return 'retry';
      }
      await db.query('DELETE FROM account_mail_outbox WHERE token_hash = $1 AND attempts = $2', args);
      return 'delivered';
    },
  };
}
