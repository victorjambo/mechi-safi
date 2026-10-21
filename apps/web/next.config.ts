import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(__dirname, '../..'),
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};

export default config;
