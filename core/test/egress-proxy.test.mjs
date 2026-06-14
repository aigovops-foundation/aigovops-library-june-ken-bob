// test/egress-proxy.test.mjs
// Ticket 4 acceptance (the runnable half): the egress proxy permits ONLY
// declared host:port pairs and blocks everything else at the boundary, emitting
// a receipt. CONNECT tunnels and plain-HTTP forwarding are both enforced.

import { test } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-egress-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { createEgressProxy } = await import('../src/core/egress-proxy.js');

// Tiny TCP target to tunnel to (stands in for an allowed upstream).
function tcpEcho() {
  const srv = net.createServer((sock) => sock.on('data', (d) => sock.write(d)));
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port })));
}

// Minimal CONNECT client: returns the proxy's status line + a connected socket.
// unref() so a lingering tunnel never keeps the test process alive.
function connectThroughProxy(proxyPort, hostport) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, '127.0.0.1', () => {
      sock.write(`CONNECT ${hostport} HTTP/1.1\r\nHost: ${hostport}\r\n\r\n`);
    });
    sock.unref();
    let buf = '';
    const onData = (d) => {
      buf += d.toString('latin1');
      if (buf.includes('\r\n\r\n')) {
        sock.removeListener('data', onData);
        resolve({ statusLine: buf.split('\r\n')[0], sock });
      }
    };
    sock.on('data', onData);
    sock.on('error', reject);
    setTimeout(() => reject(new Error('timeout')), 3000);
  });
}

test('CONNECT to an allowed host tunnels through and carries bytes', async () => {
  const { srv, port } = await tcpEcho();
  const emitted = [];
  const proxy = createEgressProxy({ allow: [`127.0.0.1:${port}`], emit: (m) => emitted.push(m) });
  const pport = await proxy.listen();
  try {
    const { statusLine, sock } = await connectThroughProxy(pport, `127.0.0.1:${port}`);
    assert.match(statusLine, /200 Connection Established/);
    const echoed = await new Promise((resolve) => { sock.once('data', (d) => resolve(d.toString())); sock.write('ping'); });
    assert.strictEqual(echoed, 'ping');
    sock.destroy();
    assert.strictEqual(emitted.length, 0, 'allowed traffic emits no block receipt');
  } finally {
    await proxy.close(); await new Promise((r) => srv.close(r));
  }
});

test('CONNECT to a disallowed host is refused (403) and emits a receipt', async () => {
  const emitted = [];
  const proxy = createEgressProxy({ allow: ['127.0.0.1:9'], emit: (m) => emitted.push(m) });
  const pport = await proxy.listen();
  try {
    const { statusLine } = await connectThroughProxy(pport, 'evil.example.com:443');
    assert.match(statusLine, /403 Forbidden/);
    assert.strictEqual(proxy.blocked.length, 1);
    assert.strictEqual(proxy.blocked[0].destination, 'evil.example.com:443');
    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].action, 'egress-block');
    assert.strictEqual(emitted[0].detail.type, 'net-egress');
  } finally {
    await proxy.close();
  }
});

test('plain-HTTP request to a disallowed host is blocked with 403', async () => {
  const emitted = [];
  const proxy = createEgressProxy({ allow: [], emit: (m) => emitted.push(m) });
  const pport = await proxy.listen();
  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: pport, method: 'GET', path: 'http://blocked.example.com/x', headers: { host: 'blocked.example.com' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.strictEqual(status, 403);
    assert.ok(emitted.some((m) => m.action === 'egress-block' && m.detail.proto === 'http'));
  } finally {
    await proxy.close();
  }
});

test('wildcard allow ("*") permits any destination', async () => {
  const { srv, port } = await tcpEcho();
  const proxy = createEgressProxy({ allow: ['*'], emit: () => {} });
  const pport = await proxy.listen();
  try {
    const { statusLine, sock } = await connectThroughProxy(pport, `127.0.0.1:${port}`);
    assert.match(statusLine, /200 Connection Established/);
    sock.destroy();
  } finally {
    await proxy.close(); await new Promise((r) => srv.close(r));
  }
});
