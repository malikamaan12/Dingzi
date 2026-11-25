import type { DurableObjectState, WebSocket as CfWebSocket } from '@cloudflare/workers-types';

/**
 * Cloudflare Durable Object with WebSocket Hibernation (one stateful room per branch_id).
 * Scopes guest sockets strictly to their tracking_token tag (`pager:<token>` / `waitlist:<token>`)
 * while authenticated staff sockets subscribe to `staff`.
 */
export class BranchRealtimeDO {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const body = (await request.json()) as {
        tags: string[];
        payload: Record<string, unknown>;
      };
      const serialized = JSON.stringify({
        ...body.payload,
        at: new Date().toISOString(),
      });
      const notified = new Set<CfWebSocket>();
      for (const tag of body.tags || []) {
        for (const ws of this.ctx.getWebSockets(tag)) {
          if (notified.has(ws)) continue;
          notified.add(ws);
          try {
            ws.send(serialized);
          } catch {
            try { ws.close(1011, 'Send failed'); } catch {}
          }
        }
      }
      return Response.json({ delivered: notified.size });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ message: 'Expected WebSocket upgrade or broadcast POST' }, { status: 426 });
    }

    const scope = url.searchParams.get('scope') || '';
    if (!/^(staff|pager:[a-f0-9-]{36}|waitlist:[a-f0-9-]{36}|coaster:[a-f0-9-]{36})$/i.test(scope)) {
      return Response.json({ message: 'Invalid realtime subscription scope' }, { status: 400 });
    }

    // @ts-expect-error WebSocketPair is provided by the Cloudflare Workers runtime
    const pair = new WebSocketPair();
    const client = pair[0] as CfWebSocket;
    const server = pair[1] as CfWebSocket;
    this.ctx.acceptWebSocket(server, [scope.toLowerCase()]);
    server.send(JSON.stringify({ type: 'connected', scope: scope.toLowerCase(), at: new Date().toISOString() }));

    // @ts-expect-error webSocket property on Response init in Workers runtime
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: CfWebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string' && message === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', at: Date.now() }));
    }
  }

  async webSocketClose(ws: CfWebSocket, code: number, reason: string) {
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws: CfWebSocket) {
    try { ws.close(1011, 'WebSocket error'); } catch {}
  }
}
