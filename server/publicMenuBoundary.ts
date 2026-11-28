// Enforced before static SPA fallback and before sessions/DB access on the public Worker.
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const slug = '[a-z0-9]+(?:-[a-z0-9]+)*';
const guestPage = new RegExp(
  `^/(?:menu/${uuid}|v/${slug}|screen/${slug}|screen/${uuid}|pager/${uuid}|waitlist/${uuid}|booking/${uuid}|bay/${uuid}|table/${uuid}|tag/${uuid})/?$`,
  'i',
);
const legacyPublicApi = new RegExp(
  `^/api/(?:(?:menu|restaurant|categories|menu-items)/public/${uuid}|price-variants/public/(?:restaurant/)?${uuid})/?$`,
  'i',
);
const hospitalityPublicGet = /^\/api\/public\/[a-z0-9/_-]+$/i;
const hospitalityPublicPost =
  /^\/api\/(?:public\/(?:orders|pager\/lookup|tag\/lookup|pager\/[a-f0-9-]{36}\/(?:feedback|arm|ack)|payments\/[a-f0-9-]{36}\/confirm-sandbox|reservations\/[a-f0-9-]{36}|reservations\/[a-f0-9-]{36}\/confirm-deposit|booking\/[a-f0-9-]{36}\/cancel|waitlist\/[a-f0-9-]{36}|waitlist-ticket\/[a-f0-9-]{36}\/(?:respond|arm)|curbside\/checkin|aggregator-click|push\/subscribe|push\/unsubscribe|push\/test)|webhooks\/payments\/(?:skipcash|sadad))\/?$/i;
const photo = new RegExp(`^/objects/${uuid}$`, 'i');
const pwaStatic = new Set([
  '/manifest.webmanifest',
  '/sw.js',
  '/icon-192.svg',
  '/icon-512.svg',
  '/apple-touch-icon.svg',
]);
const brandStatic = /^\/brand\/[a-z0-9._-]+\.(?:svg|png)$/i;

export function publicMenuRequestAllowed(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (['GET', 'HEAD'].includes(request.method)) {
    return (
      path === '/' ||
      path === '/index.html' ||
      path === '/favicon.svg' ||
      pwaStatic.has(path) ||
      brandStatic.test(path) ||
      path.startsWith('/assets/') ||
      guestPage.test(path) ||
      photo.test(path) ||
      path === '/api/cafes' ||
      path === '/api/health' ||
      legacyPublicApi.test(path) ||
      hospitalityPublicGet.test(path) ||
      path.startsWith('/api/ws/public/')
    );
  }
  if (request.method === 'POST') {
    return hospitalityPublicPost.test(path);
  }
  return false;
}

export function blockedPublicMenuRequest(request: Request): Response {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/') || pathname.startsWith('/objects/')) {
    return Response.json({ message: 'This address serves customer menus only.' }, { status: 404, headers });
  }
  const html =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dingzi · Customer Menus</title><style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#F6F5FC;color:#17132E;font-family:system-ui,sans-serif}main{padding:32px;max-width:380px}h1{font-size:30px;letter-spacing:-0.025em}p{line-height:1.6;color:#57507A}a{display:inline-block;margin-top:12px;padding:14px 22px;border-radius:20px;background:#6236FF;color:#FFFFFF;text-decoration:none;font-weight:600}</style><main><h1>Customer menus only.</h1><p>This page isn’t available here. Explore a venue on dingzi or scan its menu QR.</p><a href="/">Browse venues</a></main></html>';
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 404,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
