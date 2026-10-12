import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, digest] = hash.split(':');
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64), expected = Buffer.from(digest, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Thiếu TOKEN_ENCRYPTION_KEY 32 byte');
  return Buffer.from(value, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
export function validSignature(body: string, signature: string | null, secret: string) {
  if (!signature || !secret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function allowedToSend(lastCustomerAt: Date | null, now = new Date()) {
  return !!lastCustomerAt && now.getTime() >= lastCustomerAt.getTime() && now.getTime() - lastCustomerAt.getTime() < 24 * 60 * 60 * 1000;
}
export function canAiSend(status: string, currentVersion: number, jobVersion: number, enabled: boolean) {
  return status === 'AI_ACTIVE' && currentVersion === jobVersion && enabled;
}
