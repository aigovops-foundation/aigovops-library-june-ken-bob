// src/core/httpclient.js
// Dependency-free outbound HTTP for the Hermes channels (email/sms/voice/telegram).
// Node's built-in https only — no axios, no fetch polyfill, no supply chain.
//
// EGRESS IS DECLARED, OR IT FAILS CLOSED. Every outbound call names the host it
// will contact; a host not on the allow-list throws `egress-denied` BEFORE a
// socket opens. The allow-list is the union of (a) the hosts each configured
// channel declares via Notifier.hosts(), and (b) NOTIFY_ALLOWED_HOSTS (comma
// list). This is the same "no ambient egress" rule the sandbox enforces for tools.

import https from 'node:https';
import { NotifyError } from './notify.shared.js';

// Hosts the built-in channels are known to use. The factory adds each *configured*
// channel's hosts() to the live allow-list; this set is the backstop default.
export const KNOWN_HOSTS = ['api.telegram.org', 'api.twilio.com', 'api.postmarkapp.com'];

export function envAllowedHosts() {
  return String(process.env.NOTIFY_ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Build the effective allow-list from explicit hosts + env. Pure; testable.
export function buildAllowList(hosts = []) {
  return new Set([...hosts, ...envAllowedHosts()]);
}

function parsed(url) {
  let u; try { u = new URL(url); } catch { throw new NotifyError('bad-url', `not a url: ${url}`); }
  if (u.protocol !== 'https:') throw new NotifyError('egress-denied', `only https is allowed, got '${u.protocol}'`);  // TLS only, by contract
  return u;
}

// Low-level request. `allow` is a Set of permitted hostnames; omit to allow only
// KNOWN_HOSTS + env. Returns { status, text, json } — json is null if unparseable.
// Injectable for tests via the orchestrator (channels never import https directly
// in a way a test can't replace — they take `transport` and default to this).
export function request({ url, method = 'POST', headers = {}, body = null, allow = null, timeoutMs = 10000 }) {
  let host;
  try { host = parsed(url).host.split(':')[0]; } catch (e) { return Promise.reject(e); }   // bad-url / non-https fail closed
  const allowed = allow || buildAllowList(KNOWN_HOSTS);
  if (!allowed.has(host)) {
    return Promise.reject(new NotifyError('egress-denied', `egress to '${host}' is not on the allow-list (declare it via the channel or NOTIFY_ALLOWED_HOSTS)`));
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const settle = (fn, v) => { if (!done) { done = true; fn(v); } };
    const req = https.request(url, { method, headers, timeout: timeoutMs }, (res) => {
      let data = '', len = 0;
      res.on('data', (c) => {
        len += c.length;
        if (len > 1e6) { req.destroy(); return settle(reject, new NotifyError('too-large', 'response exceeded 1MB')); }
        data += c;
      });
      res.on('end', () => { let json = null; try { json = data ? JSON.parse(data) : null; } catch { /* non-json */ } settle(resolve, { status: res.statusCode, text: data, json }); });
    });
    req.on('error', (e) => settle(reject, new NotifyError('network', e.message)));
    req.on('timeout', () => { req.destroy(); settle(reject, new NotifyError('timeout', `no response in ${timeoutMs}ms`)); });
    if (body) req.write(body);
    req.end();
  });
}

// Form-encoded POST (Twilio). Returns the same shape as request().
export function postForm(url, params, { headers = {}, allow = null, timeoutMs } = {}) {
  const body = new URLSearchParams(params).toString();
  return request({ url, method: 'POST', allow, timeoutMs, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers }, body });
}

// JSON POST (Telegram, Postmark). Returns the same shape as request().
export function postJson(url, obj, { headers = {}, allow = null, timeoutMs } = {}) {
  const body = JSON.stringify(obj);
  return request({ url, method: 'POST', allow, timeoutMs, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }, body });
}

// HTTP Basic auth header value (Twilio: SID:authToken).
export function basicAuth(user, pass) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}
