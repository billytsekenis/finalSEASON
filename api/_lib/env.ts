import { HttpError } from './http.js';

function required(name: string, minLength = 1): string {
  const v = process.env[name];
  if (!v || v.length < minLength) {
    throw new HttpError(500, `Λείπει η ρύθμιση ${name} στον διακομιστή`);
  }
  return v;
}

export const env = {
  appPassword: () => required('APP_PASSWORD', 8),
  sessionSecret: () => required('SESSION_SECRET', 32),
  redisUrl: () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  redisToken: () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  cronSecret: () => process.env.CRON_SECRET ?? '',
  isProduction: () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production',
};
