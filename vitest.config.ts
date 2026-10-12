import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ resolve: { alias: { '@': resolve(__dirname, 'src') } }, test: { fileParallelism: false, testTimeout: 30000, hookTimeout: 30000, exclude: ['node_modules/**', '.next/**', 'e2e/**'] } });
