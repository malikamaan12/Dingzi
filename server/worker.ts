import { handleAsNodeRequest } from 'cloudflare:node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import { Client, types } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import { createApiApplication, mountErrorHandler } from './apiApplication';
import { workerRequests, type WorkerEnvironment } from './workerContext';
import { publicMediaId, cachedPublicMedia, streamPublicMedia } from './workerPublicMedia';
import { publicMenuRequestAllowed, blockedPublicMenuRequest } from './publicMenuBoundary';
import { secureWorkerResponse } from './securityHeaders';
import { guestMenuId, serveGuestMenu } from './workerGuestMenu';
export { BranchRealtimeDO } from './durable-objects/branch-hub';

types.setTypeParser(1114, value => new Date(value + 'Z'));
let application: Promise<void> | undefined;
let lastCleanup = 0;
async function cleanExpired(client: Client) {
  // The free account has no spare cron slots. Small batches during API traffic
  // keep expired records bounded; a quiet café needs no background invocation.
  if (Date.now() - lastCleanup < 6 * 60 * 60 * 1000) return;
  lastCleanup = Date.now();
  try {
    await client.query('DELETE FROM rate_limit_buckets WHERE id IN (SELECT id FROM rate_limit_buckets WHERE reset_at < now() LIMIT 500)');
    await client.query('DELETE FROM sessions WHERE sid IN (SELECT sid FROM sessions WHERE expire < now() LIMIT 500)');
  } catch (error: any) {
    lastCleanup = 0;
    console.error('Expiry cleanup failed', { type: error?.name, code: error?.code });
  }
}
function initializeApplication() {
  if (!application) application = createApiApplication().then(({ app, server }) => {
    mountErrorHandler(app);
    server.listen(8080);
  }).catch(error => { application = undefined; throw error; });
  return application;
}
function configured(env: WorkerEnvironment) {
  return env.HYPERDRIVE?.connectionString && env.SESSION_SECRET?.length >= 48 &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '') &&
    env.SUPABASE_SERVICE_ROLE_KEY && /^[a-z0-9-]+$/.test(env.STORAGE_BUCKET || '') &&
    /^[a-f0-9]{64}$/.test(env.PASSWORD_SERVICE_SECRET || '');
}
function verifySignedSessionCookie(cookieHeader: string | null, secret: string, secureCookie: boolean): string | null {
  if (!cookieHeader || !secret) return null;
  const targetName = secureCookie ? '__Host-cafe.sid' : 'connect.sid';
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name !== targetName) continue;
    let raw = part.slice(eqIdx + 1).trim();
    try { raw = decodeURIComponent(raw); } catch { return null; }
    if (!raw.startsWith('s:')) return null;
    const unsigned = raw.slice(2);
    const dotIdx = unsigned.lastIndexOf('.');
    if (dotIdx <= 0) return null;
    const sid = unsigned.slice(0, dotIdx);
    const providedSig = unsigned.slice(dotIdx + 1);
    const expectedSig = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length === b.length && timingSafeEqual(a, b)) return sid;
    return null;
  }
  return null;
}

async function handleRequest(request: Request, env: WorkerEnvironment, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (env.APPLICATION_SURFACE === 'public') {
      if (!publicMenuRequestAllowed(request)) return blockedPublicMenuRequest(request);
      // Ignore manually replayed staff credentials on the customer origin.
      const headers = new Headers(request.headers);
      headers.delete('Cookie'); headers.delete('Authorization'); headers.delete('X-Cafe-Context');
      request = new Request(request, { headers });
    } else if (env.APPLICATION_SURFACE !== 'management') {
      return Response.json({ message: 'Application surface is not configured' }, { status: 503 });
    }
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/objects/') && !url.pathname.startsWith('/public-objects/')) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/api/ws/public/') && env.BRANCH_HUB) {
      const match = url.pathname.match(/^\/api\/ws\/public\/([a-f0-9-]{36})\/?$/i);
      if (!match) return Response.json({ message: 'Invalid branch realtime room' }, { status: 400 });
      const scope = url.searchParams.get('scope') || '';
      if (!/^(pager|waitlist|coaster):[a-f0-9-]{36}$/i.test(scope)) {
        return Response.json({ message: 'Guest sockets require a valid tracking scope' }, { status: 403 });
      }
      const stub = env.BRANCH_HUB.get(env.BRANCH_HUB.idFromName(match[1]));
      return stub.fetch(request as any) as unknown as Response;
    }
    if (!configured(env)) return Response.json({ message: 'Deployment setup is incomplete' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const photo = publicMediaId(request);
    if (photo) { const cached = await cachedPublicMedia(request); if (cached) return cached; }
    const client = new Client({ connectionString: env.HYPERDRIVE.connectionString, connectionTimeoutMillis: 10000, statement_timeout: 20000 });
    const pending: Promise<unknown>[] = [];
    try {
      await client.connect();
      if (photo) {
        const response = await streamPublicMedia(request,photo,client,env,ctx);
        await client.end(); return response;
      }
      if (url.pathname === '/api/health') {
        await client.query('SELECT 1'); await client.end();
        return Response.json({ ready: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (env.APPLICATION_SURFACE === 'management' && url.pathname.startsWith('/api/ws/staff/') && env.BRANCH_HUB) {
        const match = url.pathname.match(/^\/api\/ws\/staff\/([a-f0-9-]{36})\/?$/i);
        if (!match) {
          await client.end();
          return Response.json({ message: 'Invalid branch realtime room' }, { status: 400 });
        }
        const branchId = match[1];
        const sid = verifySignedSessionCookie(
          request.headers.get('Cookie'),
          env.SESSION_SECRET,
          (env as any).COOKIE_SECURE !== 'false',
        );
        if (!sid) {
          await client.end();
          return Response.json({ message: 'Unauthorized staff socket' }, { status: 401 });
        }
        const { rows } = await client.query<{ allowed: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM sessions s
            JOIN users u ON u.id = (s.sess->>'userId')
            LEFT JOIN restaurants r ON r.id = $2
            WHERE s.sid = $1
              AND s.expire > now()
              AND u.account_status = 'active'
              AND (
                u.role = 'super_admin'
                OR r.user_id = u.id
                OR EXISTS (
                  SELECT 1 FROM staff_assignments sa
                  WHERE sa.user_id = u.id AND sa.is_active = true
                    AND (sa.restaurant_id = $2 OR (r.tenant_id IS NOT NULL AND sa.tenant_id = r.tenant_id))
                )
                OR EXISTS (
                  SELECT 1 FROM tenants t
                  WHERE r.tenant_id = t.id AND t.owner_user_id = u.id
                )
              )
          ) AS allowed`,
          [sid, branchId],
        );
        await client.end();
        if (!rows[0]?.allowed) {
          return Response.json({ message: 'Forbidden branch socket' }, { status: 403 });
        }
        const doUrl = new URL(request.url);
        doUrl.searchParams.set('scope', 'staff');
        const stub = env.BRANCH_HUB.get(env.BRANCH_HUB.idFromName(branchId));
        return stub.fetch(new Request(doUrl.toString(), request) as any) as unknown as Response;
      }
      const menuId = guestMenuId(request);
      if (menuId) {
        const response = await serveGuestMenu(request, menuId, client);
        await client.end();
        return response;
      }
      return await workerRequests.run({ db: drizzle(client, { schema }), env, pending }, async () => {
        await initializeApplication();
        const headers = new Headers(request.headers);
        // Never trust client-supplied forwarding headers for cookies, CSRF or rate limits.
        headers.set('X-Forwarded-Proto', url.protocol.slice(0,-1));
        headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '127.0.0.1');
        headers.set('Host', url.host);
        const forwarded = new Request(request, { headers });
        const response = await handleAsNodeRequest(8080, forwarded);
        // API responses are JSON. Drain them so session writes and finish audit tasks
        // settle while this request still owns its connection. Media streams stay streaming.
        if (url.pathname.startsWith('/api/')) {
          const body = await response.arrayBuffer();
          await Promise.all(pending);
          await cleanExpired(client);
          await client.end();
          return new Response(body, response);
        }
        // GET media metadata has finished querying before the body is streamed.
        ctx.waitUntil(client.end());
        return response;
      });
    } catch (error: any) {
      console.error('Worker request failed', { type: error?.name, code: error?.code });
      ctx.waitUntil(Promise.allSettled([...pending, client.end()]));
      return Response.json({ message: 'Service temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
export default {
  async fetch(request: Request, env: WorkerEnvironment, ctx: ExecutionContext): Promise<Response> {
    try { return secureWorkerResponse(request, await handleRequest(request, env, ctx)); }
    catch (error: any) {
      console.error('Worker request failed', { type: error?.name, code: error?.code });
      return secureWorkerResponse(request, Response.json({ message: 'Service temporarily unavailable. Please try again.' }, { status: 503 }));
    }
  },
  async scheduled(_event: ScheduledController, env: WorkerEnvironment, ctx: ExecutionContext) {
    if (!configured(env)) return;
    ctx.waitUntil((async () => {
      const client = new Client({ connectionString: env.HYPERDRIVE.connectionString, connectionTimeoutMillis: 10000 });
      try { await client.connect(); await client.query('DELETE FROM rate_limit_buckets WHERE reset_at < now()'); await client.query('DELETE FROM sessions WHERE expire < now()'); }
      finally { await client.end(); }
    })());
  },
};
