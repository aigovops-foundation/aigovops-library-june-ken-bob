// src/core/egress-proxy.js
// EGRESS PROXY (Ticket 4) — the single declared way out.
// A sandboxed tool has NO ambient network. Its only route to the outside is this
// forward proxy, which permits a connection ONLY if host:port is on the tool's
// declared allow-list. Everything else is blocked here and emits a signed,
// metadata-only receipt — so "no undeclared egress" is enforced at the boundary,
// not merely inside the guest.
//
// Works for both proxy modes a runtime uses:
//   • CONNECT host:port   — HTTPS tunnels (the common case)
//   • absolute-URL HTTP   — plain HTTP forward proxying
//
// Dependency-free: Node's built-in http + net only. The gVisor backend points a
// container's HTTPS_PROXY/HTTP_PROXY at this server and gives the guest no other
// route (dedicated docker network), so the allow-list is authoritative.

import http from 'node:http';
import net from 'node:net';
import * as beacon from './beacon.js';

export function createEgressProxy({ allow = [], emit = (m) => beacon.emit(m), actor = 'sandbox:egress' } = {}) {
  // Normalize host:port before matching so case ("API.GitHub.com:443") and a trailing FQDN dot
  // ("api.github.com.:443") can't slip a request past the exact-string allow-list.
  const norm = (hp) => {
    const s = String(hp).toLowerCase();
    const i = s.lastIndexOf(':');
    const host = (i > 0 ? s.slice(0, i) : s).replace(/\.+$/, '');
    return i > 0 ? host + s.slice(i) : host;
  };
  const allowSet = new Set(allow.map(norm));
  const blocked = [];
  const isAllowed = (hostport) => allowSet.has(norm(hostport)) || allowSet.has('*');

  const block = (hostport, proto) => {
    blocked.push({ destination: hostport, proto });
    emit({ kind: 'sandbox', actor, action: 'egress-block', detail: { type: 'net-egress', destination: hostport, proto } });
  };

  const server = http.createServer((req, res) => {
    // Plain-HTTP forward proxy: req.url is an absolute URL.
    let target;
    try { target = new URL(req.url); } catch { res.writeHead(400); return res.end('bad request'); }
    const hostport = `${target.hostname}:${target.port || (target.protocol === 'https:' ? 443 : 80)}`;
    if (!isAllowed(hostport)) {
      block(hostport, 'http');
      res.writeHead(403, { 'content-type': 'text/plain' });
      return res.end(`egress denied: ${hostport}`);
    }
    const upstream = http.request(
      { hostname: target.hostname, port: target.port || 80, path: (target.pathname || '/') + (target.search || ''), method: req.method, headers: req.headers },
      (ur) => { res.writeHead(ur.statusCode || 502, ur.headers); ur.pipe(res); }
    );
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('bad gateway'); });
    req.pipe(upstream);
  });

  // HTTPS CONNECT tunnels.
  server.on('connect', (req, clientSocket, head) => {
    const hostport = req.url; // 'host:port'
    if (!isAllowed(hostport)) {
      block(hostport, 'connect');
      try { clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); } catch { /* client gone */ }
      return clientSocket.end();
    }
    const idx = hostport.lastIndexOf(':');
    const host = hostport.slice(0, idx);
    const port = parseInt(hostport.slice(idx + 1), 10) || 443;
    const upstream = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => { try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch { /* noop */ } clientSocket.end(); });
    clientSocket.on('error', () => upstream.destroy());
  });

  return {
    server,
    blocked,                          // [{destination, proto}] — what was refused
    listen: (port = 0, host = '127.0.0.1') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve)),
    url: () => { const a = server.address(); return a ? `http://127.0.0.1:${a.port}` : null; },
  };
}
