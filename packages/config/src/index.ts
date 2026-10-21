import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

dotenv.config({ path: process.env.MECHI_ENV_FILE ?? resolve(process.cwd(), '../../.env') });

const schema = z.object({
  DATABASE_URL: z.string().default('postgresql://mechi:mechi@localhost:5432/mechi_safi?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().default(4000), WEB_ORIGIN: z.string().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().default('Africa/Nairobi'),
  MOCK_MODE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  ADMIN_PASSWORD: z.string().optional(), SESSION_SECRET: z.string().optional(),
  JEV_BASE_URL: z.string().default('https://jev-ai.org'), JEV_API_KEY: z.string().default(''), JEV_MODEL: z.string().default('jev-1.13'),
  FOOTBALL_DATA_BASE_URL: z.string().default('https://api.football-data.org/v4'), FOOTBALL_DATA_API_KEY: z.string().default(''),
});
export const config = schema.parse(process.env);
export function assertProductionConfig() {
  if (!config.MOCK_MODE && (!config.JEV_API_KEY || !config.FOOTBALL_DATA_API_KEY)) throw new Error('Real mode requires both provider keys');
  if ((process.env.NODE_ENV === 'production' || !config.MOCK_MODE) && (!config.ADMIN_PASSWORD || config.ADMIN_PASSWORD.length < 16 || config.ADMIN_PASSWORD === 'change-this-long-private-password' || !config.SESSION_SECRET || config.SESSION_SECRET.length < 32 || config.SESSION_SECRET.startsWith('replace-with-'))) throw new Error('Production and real mode require a strong ADMIN_PASSWORD and SESSION_SECRET');
}
