import type { SimEvent } from './types';

export interface SocketHandlers {
  onEvent: (event: SimEvent) => void;
  onStatus: (connected: boolean) => void;
}

const RECONNECT_MS = 2000;

/**
 * Connects to Simcore's /ws endpoint and keeps reconnecting until closed.
 * Returns a function that closes the socket for good.
 */
export function connectSocket(handlers: SocketHandlers, url = defaultUrl()): () => void {
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => handlers.onStatus(true);
    ws.onclose = () => {
      handlers.onStatus(false);
      if (!closed) timer = setTimeout(open, RECONNECT_MS);
    };
    ws.onmessage = (msg) => {
      try {
        handlers.onEvent(JSON.parse(msg.data) as SimEvent);
      } catch (err) {
        console.warn('Unparseable event', err);
      }
    };
  };

  open();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}

function defaultUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}
