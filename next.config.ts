import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function config(phase: string): NextConfig {
  // Dev and production must never share one output directory: `next build` while
  // `next dev` is running overwrites the dev chunks and the browser starts
  // receiving 404 / wrong MIME for CSS and JavaScript.
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    distDir: development ? '.next-dev' : '.next',
    outputFileTracingRoot: process.cwd(),
    serverExternalPackages: ['pdf-parse', 'mammoth', 'bullmq', 'ioredis'],
    experimental: { serverActions: { bodySizeLimit: '12mb' } },
    async headers() { return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
    ] }]; }
  };
}
