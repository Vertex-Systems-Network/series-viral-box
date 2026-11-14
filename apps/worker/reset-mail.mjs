import { spawn } from 'node:child_process';

export function resetMailer(env) {
  const { RESET_MAIL_FROM: from, SENDMAIL_PATH: executable, AUTH_PUBLIC_ORIGIN: origin } = env;
  if (!executable || !origin?.startsWith('https://') ||
      !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/.test(from ?? '')) return null;
  return (email, link) => new Promise((resolve, reject) => {
    const child = spawn(executable, ['-i', '--', email], {
      stdio: ['pipe', 'ignore', 'ignore'], timeout: 10000,
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Mail delivery failed')));
    child.stdin.once('error', reject);
    child.stdin.end(`From: ${from}\r\nSubject: Reset your Series Viral Box password\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\nOpen this link within 20 minutes:\r\n${link}\r\n`);
  });
}
