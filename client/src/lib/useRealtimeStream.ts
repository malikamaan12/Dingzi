import { useEffect, useRef } from 'react';

export interface IncomingRealtimeEvent {
  type: string;
  branchId: string;
  at: string;
  data: any;
}

/**
 * Connects to Server-Sent Events locally (or Durable Object WebSocket in Cloudflare Workers)
 * to deliver sub-second status transitions without polling lag.
 */
export function useRealtimeStream(
  sseUrl: string | null,
  onEvent: (event: IncomingRealtimeEvent) => void,
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!sseUrl || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(sseUrl, { withCredentials: sseUrl.startsWith('/api/hospitality/') });
      es.onmessage = event => {
        try {
          const parsed = JSON.parse(event.data) as IncomingRealtimeEvent;
          callbackRef.current(parsed);
        } catch {}
      };
    } catch {
      es = null;
    }
    return () => {
      es?.close();
    };
  }, [sseUrl]);
}
