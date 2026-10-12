import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { hashPassword, verifyPassword, encrypt, decrypt, validSignature, allowedToSend, canAiSend } from '../src/lib/security';
import { publicIp, importFile } from '../src/lib/imports';
import { splitChunks, lexicalScore } from '../src/lib/knowledge';
describe('security and source guards', () => {
  it('hashes passwords and rejects wrong credentials', () => {
    const hash = hashPassword('a-strong-password'); expect(hash).not.toContain('a-strong-password');
    expect(verifyPassword('a-strong-password', hash)).toBe(true); expect(verifyPassword('bad', hash)).toBe(false);
  });
  it('encrypts and authenticates tokens', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
    const token = encrypt('secret-page-token'); expect(token).not.toContain('secret'); expect(decrypt(token)).toBe('secret-page-token');
    expect(() => decrypt(token.slice(0, -2) + 'xx')).toThrow();
  });
  it('verifies exact raw webhook bodies', () => {
    const body = '{"object":"page"}'; const signature = 'sha256=' + createHmac('sha256', 'app-secret').update(body).digest('hex');
    expect(validSignature(body, signature, 'app-secret')).toBe(true); expect(validSignature(body + ' ', signature, 'app-secret')).toBe(false);
    expect(validSignature(body, null, 'app-secret')).toBe(false); expect(validSignature(body, signature, '')).toBe(false);
  });
  it('checks send window and stale AI versions', () => {
    const now = new Date(); expect(allowedToSend(new Date(now.getTime() - 3600000), now)).toBe(true);
    expect(allowedToSend(new Date(now.getTime() - 86400000), now)).toBe(false); expect(allowedToSend(null)).toBe(false);
    expect(canAiSend('AI_ACTIVE', 3, 3, true)).toBe(true); expect(canAiSend('HUMAN_ACTIVE', 3, 3, true)).toBe(false); expect(canAiSend('AI_ACTIVE', 4, 3, true)).toBe(false);
  });
  it('blocks internal, mapped and special IP addresses', () => {
    for (const ip of ['127.0.0.1','10.0.0.2','172.20.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2002:7f00:1::']) expect(publicIp(ip)).toBe(false);
    expect(publicIp('8.8.8.8')).toBe(true); expect(publicIp('2606:4700:4700::1111')).toBe(true);
  });
  it('imports text, rejects unsupported or disguised files', async () => {
    expect(await importFile(new File(['Chính sách giao hàng được duyệt'], 'policy.txt'))).toContain('giao hàng');
    await expect(importFile(new File(['not a pdf'], 'policy.pdf'))).rejects.toThrow();
    await expect(importFile(new File(['old doc'], 'policy.doc'))).rejects.toThrow();
  });
  it('chunks bounded content and rejects unrelated lexical match', () => {
    const text = 'a'.repeat(2500); expect(splitChunks(text).every(x => x.length <= 1000)).toBe(true);
    expect(lexicalScore('serum giá bao nhiêu', 'Đèn bàn bảo hành')).toBe(0);
  });
});
