import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
function extractIsolated(buffer: Buffer, ext: string): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=128', resolve(process.cwd(), 'src/lib/extract-child.cjs'), ext], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, NODE_ENV: 'production' } });
    let output = '', failed = false;
    const timeout = setTimeout(() => { failed = true; child.kill('SIGKILL'); reject(new HttpError(400, 'Tài liệu xử lý quá lâu')); }, 15000);
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 100000) { failed = true; child.kill('SIGKILL'); reject(new HttpError(400, 'Tài liệu quá lớn')); } });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timeout); reject(new HttpError(400, 'Không khởi tạo được xử lý tài liệu')); });
    child.on('close', code => { clearTimeout(timeout); if (!failed) code === 0 ? done(output) : reject(new HttpError(400, 'Tài liệu lỗi, quá lớn hoặc không có văn bản')); });
    child.stdin.on('error', () => {}); child.stdin.end(buffer);
  });
}
import { HttpError } from './auth';
export function publicIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    // Only global unicast IPv6; conservatively reject mapped/transition/special ranges.
    const value = ip.toLowerCase();
    return /^[23][0-9a-f]{3}:/.test(value) && !value.startsWith('2001:') && !value.startsWith('2002:');
  }
  const [a, b] = ip.split('.').map(Number);
  return isIP(ip) === 4 && !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
export async function validatePublicUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new HttpError(400, 'URL công khai HTTP/HTTPS không hợp lệ');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !publicIp(a.address))) throw new HttpError(400, 'Không cho phép URL nội bộ hoặc đặc biệt');
  return { url, addresses };
}
// Node fetch resolves DNS again; use a pinned DNS lookup with https/http.request to avoid DNS rebinding.
export async function importUrl(raw: string): Promise<string> {
  const { request: httpRequest } = await import('node:http');
  const { request: httpsRequest } = await import('node:https');
  let current = raw;
  for (let redirects = 0; redirects < 4; redirects++) {
    const { url, addresses } = await validatePublicUrl(current);
    const result = await new Promise<{ status: number; location?: string; type: string; body: Buffer }>((resolve, reject) => {
      const address = addresses[0];
      let deadline: ReturnType<typeof setTimeout>;
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        headers: { 'User-Agent': 'PageFlow-Knowledge/1.0', Accept: 'text/html,text/plain' },
        lookup: (_host, _options, callback) => { callback(null, address.address, isIP(address.address)); }
      }, response => {
        const buffers: Buffer[] = []; let size = 0;
        response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2_000_000) { request.destroy(new Error('Trang quá lớn')); } else buffers.push(chunk); });
        response.on('end', () => resolve({ status: response.statusCode || 0, location: response.headers.location, type: response.headers['content-type'] || '', body: Buffer.concat(buffers) }));
        response.on('error', reject);
      });
      deadline = setTimeout(() => request.destroy(new Error('Hết thời gian tải website')), 10000);
      request.on('close', () => clearTimeout(deadline));
      request.on('error', reject); request.end();
    });
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location) { current = new URL(result.location, current).toString(); continue; }
    if (result.status !== 200 || !/text\/(html|plain)/i.test(result.type)) throw new HttpError(400, 'Website không có nội dung văn bản hợp lệ');
    const $ = load(result.body.toString('utf8')); $('script,style,nav,footer,header,noscript,iframe').remove();
    const text = ($('main').text() || $('article').text() || $('body').text()).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    if (!text) throw new HttpError(400, 'Không lấy được nội dung; website có thể cần JavaScript');
    return text.slice(0, 100000);
  }
  throw new HttpError(400, 'Website chuyển hướng quá nhiều lần');
}
export async function importFile(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new HttpError(400, 'Tệp tối đa 8 MB');
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase();
  let text: string;
  if (ext === 'txt') text = buffer.toString('utf8');
  else if (ext === 'docx' && buffer.subarray(0, 2).toString() === 'PK') text = await extractIsolated(buffer, ext);
  else if (ext === 'pdf' && buffer.subarray(0, 5).toString() === '%PDF-') text = await extractIsolated(buffer, ext); else throw new HttpError(400, 'Chỉ hỗ trợ TXT, PDF có văn bản, DOCX. Chuyển .doc sang .docx trước.');
  if (text.trim().length < 10) throw new HttpError(400, 'Tệp không có đủ văn bản; PDF scan cần OCR bên ngoài');
  if (text.length > 100000) throw new HttpError(400, 'Nội dung tối đa 100.000 ký tự');
  return text.trim();
}
