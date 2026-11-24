import { useEffect, useRef } from 'react';

export interface IncomingRealtimeEvent {
  type: string;
  branchId: string;
  at: string;
  data: any;
}

/**
 * Connects to Server-Sent Events locally and automatically upgrades to Cloudflare
 * Durable Object WebSocket Hibernation (`BranchRealtimeDO`) when running on Workers
 * (where the stream endpoint returns `{ mode: 'poll_or_ws', wsUrl }`).
 */
export function useRealtimeStream(
  sseUrl: string | null,
  onEvent: (event: IncomingRealtimeEvent) => void,
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!sseUrl || typeof window === 'undefined') return;
    let cancelled = false;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;
    let pingTimer: number | null = null;

    const connectWebSocket = (wsPath: string) => {
      if (cancelled || typeof WebSocket === 'undefined') return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const fullWsUrl = wsPath.startsWith('ws') ? wsPath : `${proto}//${window.location.host}${wsPath}`;
        ws = new WebSocket(fullWsUrl);
        ws.onmessage = event => {
          try {
            const parsed = JSON.parse(String(event.data));
            if (parsed && parsed.type && parsed.type !== 'connected' && parsed.type !== 'pong') {
              callbackRef.current(parsed as IncomingRealtimeEvent);
            }
          } catch {}
        };
        pingTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            try { ws.send('ping'); } catch {}
          }
        }, 25_000);
      } catch {
        ws = null;
      }
    };

    if (typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(sseUrl, { withCredentials: sseUrl.startsWith('/api/hospitality/') });
        es.onmessage = event => {
          try {
            const parsed = JSON.parse(event.data) as IncomingRealtimeEvent;
            callbackRef.current(parsed);
          } catch {}
        };
        es.onerror = () => {
          // On Cloudflare Workers, SSE endpoints respond with JSON `{ mode: 'poll_or_ws', wsUrl }`.
          es?.close();
          es = null;
          void fetch(sseUrl, {
            credentials: sseUrl.startsWith('/api/hospitality/') ? 'include' : 'same-origin',
          })
            .then(r => (r.ok ? r.json() : null))
            .then(info => {
              if (!cancelled && info?.mode === 'poll_or_ws' && typeof info.wsUrl === 'string') {
                connectWebSocket(info.wsUrl);
              }
            })
            .catch(() => {});
        };
      } catch {
        es = null;
      }
    }

    return () => {
      cancelled = true;
      if (pingTimer !== null) window.clearInterval(pingTimer);
      es?.close();
      try { ws?.close(); } catch {}
    };
  }, [sseUrl]);
}
