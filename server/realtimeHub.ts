import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { deferRequestTask, workerRequests } from './workerContext';

export type RealtimeChannelScope =
  | `branch:${string}`
  | `pager:${string}`
  | `waitlist:${string}`
  | `coaster:${string}`;

export interface RealtimePayload {
  type:
    | 'pager.created'
    | 'pager.updated'
    | 'pager.buzzed'
    | 'order.created'
    | 'order.paid'
    | 'waitlist.updated'
    | 'waitlist.buzzed'
    | 'reservation.updated'
    | 'curbside.arrived'
    | 'coaster.updated';
  branchId: string;
  at: string;
  data: unknown;
}

const bus = new EventEmitter();
bus.setMaxListeners(1000);

export function publishRealtimeEvent(
  scopes: RealtimeChannelScope[],
  payload: Omit<RealtimePayload, 'at'>,
) {
  const message: RealtimePayload = {
    ...payload,
    at: new Date().toISOString(),
  };
  const uniqueScopes = Array.from(new Set(scopes));
  for (const scope of uniqueScopes) {
    bus.emit(scope, message);
  }

  // When running on Cloudflare Workers with BranchRealtimeDO bound, push to the branch Durable Object room.
  const store = workerRequests.getStore();
  const hubNamespace = store?.env?.BRANCH_HUB;
  if (hubNamespace && payload.branchId) {
    const tags = uniqueScopes.map(scope => (scope.startsWith('branch:') ? 'staff' : scope.toLowerCase()));
    const stub = hubNamespace.get(hubNamespace.idFromName(payload.branchId));
    deferRequestTask(
      stub.fetch('https://branch-hub.internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags, payload: message }),
      }),
    );
  }
}

export function attachSseStream(res: Response, scope: RealtimeChannelScope, branchId?: string) {
  if (process.env.CAFE_RUNTIME === 'workers') {
    const resolvedBranch = scope.startsWith('branch:') ? scope.slice('branch:'.length) : branchId;
    const wsUrl = scope.startsWith('branch:')
      ? `/api/ws/staff/${resolvedBranch}`
      : resolvedBranch
        ? `/api/ws/public/${resolvedBranch}?scope=${encodeURIComponent(scope)}`
        : null;
    res.status(200).json({ mode: 'poll_or_ws', scope, branchId: resolvedBranch || null, wsUrl, at: new Date().toISOString() });
    return;
  }
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ scope, at: new Date().toISOString() })}\n\n`);

  const onEvent = (payload: RealtimePayload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      cleanup();
    }
  };

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      cleanup();
    }
  }, 20_000);
  heartbeat.unref?.();

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    bus.off(scope, onEvent);
  };

  bus.on(scope, onEvent);
  res.on('close', cleanup);
  res.on('error', cleanup);
}
