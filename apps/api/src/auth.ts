import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '@mechi/config';

const password = config.ADMIN_PASSWORD ?? 'dev-only-mechi-safi';
const secret = config.SESSION_SECRET ?? 'local-development-secret-change-before-deploy';
const cookieName = 'mechi_session';
function sign(value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}
function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function authenticated(request: FastifyRequest) {
  const value = request.cookies[cookieName];
  if (!value) return false;
  const [expiry, nonce, signature] = value.split('.');
  if (!expiry || !nonce || !signature || Number(expiry) < Date.now()) return false;
  return equal(signature, sign(`${expiry}.${nonce}`));
}
export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    { schema: { tags: ['Auth'], summary: 'Create private dashboard session' } },
    async (request, reply) => {
      const body = (await import('zod')).z
        .object({ password: (await import('zod')).z.string() })
        .parse(request.body);
      if (!equal(body.password, password))
        return reply
          .code(401)
          .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password' } });
      const expiry = Date.now() + 12 * 3600000;
      const nonce = randomBytes(16).toString('hex');
      reply.setCookie(cookieName, `${expiry}.${nonce}.${sign(`${expiry}.${nonce}`)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 12 * 3600,
      });
      return { authenticated: true };
    },
  );
  app.post(
    '/auth/logout',
    { schema: { tags: ['Auth'], summary: 'End private dashboard session' } },
    async (_request, reply) => {
      reply.clearCookie(cookieName, { path: '/' });
      return { authenticated: false };
    },
  );
  app.get(
    '/auth/session',
    { schema: { tags: ['Auth'], summary: 'Get private dashboard session' } },
    async (request) => ({ authenticated: authenticated(request), mockMode: config.MOCK_MODE }),
  );
}
