// Where to open the realtime socket.
//
// Normally that's the page's own origin. It isn't on synthograsizer.com: the
// Vercel proxy in front of Cloud Run answers WebSocket upgrades with its own
// 404 rather than forwarding them, so the socket has to go straight to Cloud
// Run even though the page came from the domain. The server tells us where
// via SYNTH_WS_ORIGIN; unset means same-origin, which is right for local
// installs and for any future fronting that passes upgrades through.

export async function resolveWsOrigin() {
  const sameOrigin = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  try {
    const response = await fetch('/api/thecommons/config');
    if (!response.ok) return sameOrigin;
    const { wsOrigin } = await response.json();
    // http(s):// → ws(s)://; an already-ws value passes through untouched.
    return wsOrigin ? wsOrigin.replace(/^http/, 'ws').replace(/\/$/, '') : sameOrigin;
  } catch {
    return sameOrigin;   // a missing config must never cost us the socket
  }
}
