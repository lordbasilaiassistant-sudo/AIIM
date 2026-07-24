// Hub — Durable Object that fans events out to spectator WebSockets.
// Spectators are strictly read-only: any inbound frame closes the socket.
// Uses the hibernation API so idle viewers cost nothing.

export class Hub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = await request.text();
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(payload); } catch { /* dead socket, hibernation reaps it */ }
      }
      return new Response('ok');
    }

    // The Upgrade header VALUE is case-insensitive per RFC 6455 — clients that
    // send "WebSocket" were falling through to a 404.
    if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ t: Date.now() });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response('not found', { status: 404 });
  }

  // Read-only feed: spectators never get to speak.
  webSocketMessage(ws) {
    try { ws.close(1008, 'spectators are read-only'); } catch {}
  }

  webSocketClose(ws) {
    try { ws.close(); } catch {}
  }

  webSocketError(ws) {
    try { ws.close(); } catch {}
  }
}
