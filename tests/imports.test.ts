import { describe, it, expect } from 'vitest';
import { importFile, importUrl, validatePublicUrl, MAX_IMPORTED_TEXT } from '../src/lib/imports';
import { HttpError } from '../src/lib/auth';
// Captures the thrown HttpError so a case can assert both the type and the Vietnamese message.
async function rejection(run: Promise<unknown>): Promise<HttpError> {
  try { await run; } catch (error) { if (error instanceof HttpError) return error; throw error; }
  throw new Error('Biểu thức lẽ ra phải ném HttpError');
}
describe('knowledge import formats and limits', () => {
  it('imports markdown and csv as UTF-8 text', async () => {
    expect(await importFile(new File(['# Tiêu đề\nNội dung markdown'], 'ghi-chu.md'))).toBe('# Tiêu đề\nNội dung markdown');
    expect(await importFile(new File(['sku,ten\nA1,Áo sơ mi'], 'bang-gia.csv'))).toBe('sku,ten\nA1,Áo sơ mi');
  });
  it('keeps importing txt even with an uppercase extension', async () => {
    expect(await importFile(new File(['  Chính sách bảo hành 24 tháng  '], 'CHINH-SACH.TXT'))).toBe('Chính sách bảo hành 24 tháng');
  });
  it('rejects legacy .doc and lists the supported formats', async () => {
    const error = await rejection(importFile(new File(['old doc'], 'policy.doc')));
    expect(error.status).toBe(400); expect(error.message).toMatch(/TXT, MD, CSV, PDF có văn bản, DOCX/); expect(error.message).toContain('.docx');
  });
  it('rejects a pdf without the %PDF- magic bytes', async () => {
    const error = await rejection(importFile(new File(['not a pdf'], 'policy.pdf')));
    expect(error.status).toBe(400); expect(error.message).toContain('Chỉ hỗ trợ');
  });
  it('rejects files above 8 MB before reading them', async () => {
    const error = await rejection(importFile(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'qua-lon.txt')));
    expect(error.status).toBe(400); expect(error.message).toContain('8 MB');
  });
  it('rejects text over MAX_IMPORTED_TEXT instead of truncating it', async () => {
    const error = await rejection(importFile(new File(['a'.repeat(MAX_IMPORTED_TEXT + 1)], 'qua-dai.txt')));
    expect(error.status).toBe(400); expect(error.message).toMatch(/100\.000/);
  });
  it('requires https and rejects plain http before any DNS lookup', async () => {
    const error = await rejection(validatePublicUrl('http://example.com'));
    expect(error.status).toBe(400); expect(error.message).toContain('HTTPS');
    await expect(rejection(importUrl('http://example.com'))).resolves.toBeInstanceOf(HttpError);
  });
  it('blocks literal internal IP hosts without DNS', async () => {
    for (const raw of ['https://127.0.0.1', 'https://10.0.0.1']) {
      const error = await rejection(validatePublicUrl(raw));
      expect(error.status).toBe(400); expect(error.message).toContain('nội bộ');
    }
  });
});
