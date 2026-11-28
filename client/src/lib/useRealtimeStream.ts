import { useEffect, useRef } from 'react';

export interface IncomingRealtimeEvent {
  type: string;
  branchId: string;
  at: string;
  data: any;
}

let cachedWorkersWsMode = false;

/**
 * Connects to Server-Sent Events locally and automatically upgrades to Cloudflare
 * Durable Object WebSocket Hibernation (`BranchRealtimeDO`) when running on Workers,
 * with exponential-backoff reconnection and instant lock-screen wakeup recovery.
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
    let wsEndpointPath: string | null = null;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleWsReconnect = (immediate = false) => {
      if (cancelled || !wsEndpointPath) return;
      clearReconnectTimer();
      const delay = immediate ? 50 : Math.min(5000, 1000 * Math.pow(1.6, reconnectAttempt));
      reconnectAttempt = Math.min(reconnectAttempt + 1, 6);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled && wsEndpointPath) {
          connectWebSocket(wsEndpointPath);
        }
      }, delay);
    };

    const connectWebSocket = (wsPath: string) => {
      if (cancelled || typeof WebSocket === 'undefined') return;
      wsEndpointPath = wsPath;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const fullWsUrl = wsPath.startsWith('ws') ? wsPath : `${proto}//${window.location.host}${wsPath}`;
        const socket = new WebSocket(fullWsUrl);
        ws = socket;

        socket.onopen = () => {
          reconnectAttempt = 0;
        };

        socket.onmessage = event => {
          try {
            const parsed = JSON.parse(String(event.data));
            if (parsed && parsed.type && parsed.type !== 'connected' && parsed.type !== 'pong') {
              callbackRef.current(parsed as IncomingRealtimeEvent);
            }
          } catch {}
        };

        socket.onclose = () => {
          if (ws === socket) ws = null;
          if (!cancelled) {
            scheduleWsReconnect(false);
          }
        };

        socket.onerror = () => {
          try {
            socket.close();
          } catch {}
        };

        if (pingTimer !== null) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            try {
              ws.send('ping');
            } catch {}
          } else if (!cancelled && wsEndpointPath) {
            scheduleWsReconnect(true);
          }
        }, 22_000);
      } catch {
        ws = null;
        scheduleWsReconnect(false);
      }
    };

    const discoverStreamEndpoint = () => {
      void fetch(sseUrl, {
        credentials: sseUrl.startsWith('/api/hospitality/') ? 'include' : 'same-origin',
      })
        .then(r => (r.ok ? r.json() : null))
        .then(info => {
          if (!cancelled && info?.mode === 'poll_or_ws' && typeof info.wsUrl === 'string') {
            cachedWorkersWsMode = true;
            connectWebSocket(info.wsUrl);
          }
        })
        .catch(() => {
          if (!cancelled) {
            reconnectTimer = window.setTimeout(discoverStreamEndpoint, 3000);
          }
        });
    };

    const isWorkersHost =
      cachedWorkersWsMode || /\.workers\.dev$/i.test(window.location.hostname);

    if (isWorkersHost || typeof EventSource === 'undefined') {
      discoverStreamEndpoint();
    } else {
      try {
        es = new EventSource(sseUrl, { withCredentials: sseUrl.startsWith('/api/hospitality/') });
        es.onmessage = event => {
          try {
            const parsed = JSON.parse(event.data) as IncomingRealtimeEvent;
            callbackRef.current(parsed);
          } catch {}
        };
        es.onerror = () => {
          es?.close();
          es = null;
          discoverStreamEndpoint();
        };
      } catch {
        es = null;
        discoverStreamEndpoint();
      }
    }

    const onWakeOrOnline = () => {
      if (cancelled) return;
      if (wsEndpointPath && (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
        scheduleWsReconnect(true);
      } else if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send('ping');
        } catch {}
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') onWakeOrOnline();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onWakeOrOnline);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      if (pingTimer !== null) window.clearInterval(pingTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onWakeOrOnline);
      es?.close();
      try {
        ws?.close();
      } catch {}
    };
  }, [sseUrl]);
}
