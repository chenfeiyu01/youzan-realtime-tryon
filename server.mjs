import http from 'node:http';
import https from 'node:https';
import { readFileSync, appendFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import QRCode from 'qrcode';
import { createDecartClient } from '@decartai/sdk';
import { MAX_VIEWS, modelFor } from './src/models.js';
import { cutoutAvailable, removeGarmentBackground } from './server/cutout.mjs';
import { prepareCertificates } from './scripts/make-certs.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
try {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}
const apiKey = process.env.XMAX_API_KEY || '';
const decartApiKey = process.env.DECART_API_KEY || '';
const decartClient = decartApiKey ? createDecartClient({ apiKey: decartApiKey }) : undefined;
const brokerPort = Number(process.env.BROKER_PORT || 5174);
const grantFile = path.join(root, '.local', 'bridge-access.json');
mkdirSync(path.dirname(grantFile), { recursive: true });
let bridgeGrant;
try { bridgeGrant = JSON.parse(readFileSync(grantFile, 'utf8')).grant; } catch {}
if (!bridgeGrant) { bridgeGrant = randomBytes(32).toString('hex'); writeFileSync(grantFile, JSON.stringify({ grant: bridgeGrant }), { mode: 0o600 }); }
const bridgeAuthorized = req => {
  const value = req.headers.authorization?.replace(/^Bearer /, '') || '';
  return value.length === bridgeGrant.length && timingSafeEqual(Buffer.from(value), Buffer.from(bridgeGrant));
};
function bridgeShare() {
  try {
    const { url } = JSON.parse(readFileSync(path.join(root, '.local', 'bridge-public.json'), 'utf8'));
    const relay = new URL(url);
    if (relay.protocol !== 'https:' || !relay.hostname.endsWith('.trycloudflare.com')) return;
    const link = new URL(publicURL);
    link.search = new URLSearchParams({ v: 'compare9', bridge: relay.origin, grant: bridgeGrant }).toString();
    return { url: link.href };
  } catch {}
}
const port = Number(process.env.PORT || 5173);
const httpsPort = Number(process.env.HTTPS_PORT || 3443);
const baseURL = 'https://cloud.xmax.22duck.cn/open/api/v1';
const publicURL = 'https://chenfeiyu01.github.io/youzan-realtime-tryon/';
const temporaryKeyLifetimeSeconds = 86400;
const temporaryKeyPointsLimit = 2147483647;
let sharedAccess;
try { sharedAccess = JSON.parse(readFileSync(path.join(root, '.local', 'shared-access.json'), 'utf8')); } catch {}
async function shareAccess() {
  const bridge = bridgeShare();
  if (bridge) return bridge;
  if (sharedAccess?.url) {
    const cachedURL = new URL(sharedAccess.url);
    const fragment = new URLSearchParams(cachedURL.hash.slice(1));
    if (fragment.has('xmax')) {
      for (const [key, value] of fragment) cachedURL.searchParams.set(key, value);
      cachedURL.hash = '';
      sharedAccess.url = cachedURL.href;
    }
  }
  if (sharedAccess?.expiresAt > Date.now() + 600000 && sharedAccess.pointsLimit === temporaryKeyPointsLimit) return sharedAccess;
  const data = await upstream('/temporary-api-key', 'POST', {
    expireSeconds: temporaryKeyLifetimeSeconds, pointsLimit: temporaryKeyPointsLimit, temporaryApiKeySessionLimit: 1,
  });
  if (!data?.temporaryApiKey?.startsWith('tk-')) throw new Error('未能获取体验凭证');
  const expiresAt = Date.parse(data.expireTimestamp);
  if (!Number.isFinite(expiresAt)) throw new Error('凭证过期时间无效');
  const url = new URL(publicURL);
  url.search = new URLSearchParams({ xmax: data.temporaryApiKey, expires: expiresAt, limit: temporaryKeyPointsLimit }).toString();
  sharedAccess = { url: url.href, expiresAt, pointsLimit: temporaryKeyPointsLimit };
  writeFileSync(path.join(root, '.local', 'shared-access.json'), JSON.stringify(sharedAccess), { mode: 0o600 });
  return sharedAccess;
}
const pairingToken = randomBytes(24).toString('hex');
const sessions = new Map();
const diagnosticsFile = path.join(root, '.local', 'connection-events.jsonl');
function diagnostic(event, data = {}) {
  try {
    if (existsSync(diagnosticsFile) && statSync(diagnosticsFile).size > 100000) writeFileSync(diagnosticsFile, '');
    appendFileSync(diagnosticsFile, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n', { mode: 0o600 });
  } catch {}
}
let issuing = 0;
let cutoutBusy = false;
let shutdown = false;
const addresses = () => [...new Set(Object.values(networkInterfaces()).flat()
  .filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address))];
const phoneURLs = () => addresses().map(ip => `https://${ip}:${httpsPort}/?access=${pairingToken}`);
const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const equal = (value) => typeof value === 'string' && value.length === pairingToken.length &&
  timingSafeEqual(Buffer.from(value), Buffer.from(pairingToken));
const authorized = req => equal((req.headers.cookie || '').split(';').map(s => s.trim())
  .find(s => s.startsWith('yz_access='))?.slice('yz_access='.length));
const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 2048) throw new Error('请求过大'); }
  return raw ? JSON.parse(raw) : {};
}
async function upstream(route, method, data) {
  const response = await fetch(`${baseURL}${route}`, {
    method, headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    const safeMessage = String(result.message || 'Xmax 请求失败').replaceAll(apiKey || '__none__', '[redacted]').replaceAll(decartApiKey || '__none__', '[redacted]').slice(0, 200);
    throw new Error(`${safeMessage}（${result.code || response.status}）`);
  }
  return result.data;
}
async function revoke(session) {
  if (session.provider === 'decart') { sessions.delete(session.id); return; }
  if (session.revoking) return session.revoking;
  session.revoking = (async () => {
    try {
      await upstream(`/temporary-api-key/${encodeURIComponent(session.key)}/inactive`, 'PUT');
      clearTimeout(session.timer);
      sessions.delete(session.id);
      diagnostic('closed');
    } catch (error) {
      // Keep the lease and retry revocation; never open another concurrent session.
      if (Date.now() > session.expiresAt) {
        clearTimeout(session.timer); sessions.delete(session.id); return;
      }
      clearTimeout(session.timer);
      session.timer = setTimeout(() => { void revoke(session).catch(() => {}); }, 2500);
      session.timer.unref();
      throw error;
    } finally { session.revoking = undefined; }
  })();
  return session.revoking;
}

let tlsDir;
try { tlsDir = prepareCertificates(root); }
catch { console.error('手机 HTTPS 证书准备失败；PC 本机入口仍可运行。请安装 openssl 后重启。'); }
const vite = await createViteServer({
  root, configFile: false,
  server: { middlewareMode: true, hmr: false, allowedHosts: true, fs: { deny: ['**/.env*', '**/.local/**', '**/server.mjs', '**/server/**', '**/scripts/**'] } },
  appType: 'spa',
});

async function handler(req, res, broker = false) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  res.setHeader('Cache-Control', 'no-store');
  if (broker) {
    const origin = req.headers.origin;
    if (origin !== new URL(publicURL).origin) return json(res, 403, { error: '请求来源不匹配' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (!bridgeAuthorized(req)) return json(res, 401, { error: '授权服务凭证无效，请从完整体验链接打开' });
  }
  const url = new URL(req.url, `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`);
  // A one-time visit from the local machine or a QR pairing link grants an HttpOnly browser session.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const loopbackHost = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!broker && url.pathname === '/' && (equal(url.searchParams.get('access')) || (local(req) && loopbackHost))) {
    res.setHeader('Set-Cookie', `yz_access=${pairingToken}; HttpOnly; SameSite=Strict; Path=/${req.socket.encrypted ? '; Secure' : ''}`);
    if (url.searchParams.has('access')) { res.writeHead(303, { Location: '/' }); res.end(); return; }
  }
  if (url.pathname.startsWith('/api/')) {
    if (!broker && !authorized(req)) return json(res, 401, { error: '请从电脑本机入口打开，手机请扫描电脑页面的二维码配对。' });
    if (req.method !== 'GET') {
      if (!req.headers.origin || (!broker && (req.headers.origin !== url.origin || req.headers['sec-fetch-site'] === 'cross-site'))) {
        return json(res, 403, { error: '请求来源不匹配，请刷新本页。' });
      }
    }
    try {
      if (url.pathname === '/api/config' && req.method === 'GET') {
        return json(res, 200, { configured: Boolean(apiKey || decartApiKey), providers: { xmax: Boolean(apiKey), decart: Boolean(decartApiKey) }, maxViews: MAX_VIEWS, cutout: cutoutAvailable(),
          phoneURLs: !broker && local(req) ? phoneURLs() : [], httpsAvailable: Boolean(tlsDir), publicURL });
      }
      if (url.pathname === '/api/share-link' && req.method === 'POST' && (broker || local(req))) return json(res, 200, await shareAccess());
      if (url.pathname === '/api/garment/cutout' && req.method === 'POST') {
        if (cutoutBusy) return json(res, 409, { error: '正在处理另一张图片，请稍后重试' });
        if (!cutoutAvailable()) return json(res, 503, { error: '抠图暂不可用，可先使用原图' });
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.headers['content-type']?.split(';')[0])) return json(res, 415, { error: '请选择 JPG、PNG 或 WebP 图片' });
        cutoutBusy = true;
        try {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 10 * 1024 * 1024) return json(res, 413, { error: '图片不能超过 10 MB' });
            chunks.push(chunk);
          }
          if (!size) return json(res, 400, { error: '图片内容为空' });
          const output = await removeGarmentBackground(Buffer.concat(chunks));
          if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(output); }
          return;
        } catch (error) {
          const message = String(error.message || '');
          return json(res, 422, { error: /^(图片尺寸太小|未识别到清晰主体|抠图服务尚未准备好)/.test(message) ? message : '抠图失败，可使用原图或重试' });
        } finally { cutoutBusy = false; }
      }
      if (url.pathname === '/api/diagnostics' && req.method === 'POST') {
        const data = await body(req);
        const allowed = ['prepare', 'connect', 'frame', 'update', 'error', 'network'];
        if (allowed.includes(data.event)) {
          const fields = {};
          for (const key of ['ms', 'fps', 'delay', 'code']) if (Number.isFinite(data[key])) fields[key] = Math.round(data[key]);
          if (typeof data.stage === 'string') fields.stage = data.stage.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
          diagnostic(data.event, fields);
        }
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/phone-qr' && req.method === 'GET' && local(req)) {
        const index = Number(url.searchParams.get('index') || 0);
        const phoneURL = phoneURLs()[index];
        if (!phoneURL || !tlsDir) return json(res, 404, { error: '没有可用的局域网地址' });
        const svg = await QRCode.toString(phoneURL, { type: 'svg', margin: 1, color: { dark: '#20242b', light: '#ffffff' } });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); res.end(svg); return;
      }
      if (url.pathname === '/api/session' && req.method === 'POST') {
        if (shutdown || sessions.size + issuing >= MAX_VIEWS) return json(res, 409, { error: '同时最多开启 4 个模型窗口，请先停止一个窗口。' });
        const { modelId = 'xmax-2.1' } = await body(req);
        const model = modelFor(modelId);
        if (!model) return json(res, 400, { error: '模型不受支持' });
        if ((model.provider === 'xmax' && !apiKey) || (model.provider === 'decart' && !decartClient)) return json(res, 503, { error: '当前模型尚未配置密钥' });
        if (shutdown || sessions.size + issuing >= MAX_VIEWS) return json(res, 409, { error: '同时最多开启 4 个模型窗口，请先停止一个窗口。' });
        issuing++;
        try {
          const id = randomBytes(20).toString('hex');
          let key, expiresAt;
          if (model.provider === 'decart') {
            const token = await decartClient.tokens.create({ expiresIn: 600, allowedModels: [model.remote], allowedOrigins: [req.headers.origin] });
            key = token.apiKey; expiresAt = Date.parse(token.expiresAt);
          } else {
            const data = await upstream('/temporary-api-key', 'POST', {
              expireSeconds: temporaryKeyLifetimeSeconds, pointsLimit: temporaryKeyPointsLimit, temporaryApiKeySessionLimit: 1,
            });
            if (!data?.temporaryApiKey?.startsWith('tk-')) throw new Error('Xmax 未返回有效临时凭证');
            key = data.temporaryApiKey; expiresAt = Date.parse(data.expireTimestamp);
          }
          const session = { id, key, expiresAt, model, provider: model.provider, armed: false, playing: false };
          sessions.set(id, session);
          if (res.destroyed || shutdown) { await revoke(session); return; }
          return json(res, 200, { id, provider: model.provider, temporaryApiKey: key, expiresAt });
        } finally { issuing--; }
      }
      const match = url.pathname.match(/^\/api\/session\/([a-f0-9]{40})(\/(?:arm|ready|token))?$/);
      if (match) {
        const session = sessions.get(match[1]);
        if (!session) return json(res, req.method === 'DELETE' || !match[2] ? 200 : 410, { stopped: true, error: '会话已结束，请重新开始' });
        if (req.method === 'POST' && match[2] === '/token' && session.provider === 'decart') {
          if (session.expiresAt < Date.now() + 30000) {
            const token = await decartClient.tokens.create({ expiresIn: 600, allowedModels: [session.model.remote], allowedOrigins: [req.headers.origin] });
            session.key = token.apiKey; session.expiresAt = Date.parse(token.expiresAt);
          }
          return json(res, 200, { apiKey: session.key, expiresAt: session.expiresAt });
        }
        if (req.method === 'POST' && match[2] === '/arm') {
          if (session.armed) return json(res, 409, { error: '当前会话已连接' });
          session.armed = true; session.connectAt = Date.now();
          diagnostic('armed');
          return json(res, 200, { armed: true });
        }
        if (req.method === 'POST' && match[2] === '/ready') {
          if (!session.armed || session.revoking) return json(res, 409, { error: '会话未连接或正在关闭' });
          if (!session.playing) {
            session.playing = true;
            diagnostic('playing', { ms: Date.now() - session.connectAt });
          }
          return json(res, 200, { ready: true });
        }
        if (req.method === 'DELETE' && !match[2]) { await revoke(session); return json(res, 200, { stopped: true }); }
        // sendBeacon uses same-origin POST on pagehide, without relying on async page teardown.
        if (req.method === 'POST' && !match[2]) { await revoke(session); return json(res, 200, { stopped: true }); }
      }
      return json(res, 404, { error: '接口不存在' });
    } catch (error) {
      const message = String(error.message || '连接服务失败，请稍后手动重试。').replaceAll(apiKey || '__none__', '[redacted]').replaceAll(decartApiKey || '__none__', '[redacted]');
      return json(res, 502, { error: message.slice(0, 240) });
    }
  }
  if (broker) return json(res, 404, { error: '接口不存在' });
  // Expose only browser code, public assets and Vite dependencies, never project secrets/server source.
  if (/^\/(?:\.env|\.local|server(?:\/|\.mjs)|scripts|package(?:-lock)?\.json|README|project_summary)/i.test(decodeURIComponent(url.pathname))) {
    res.writeHead(404); res.end(); return;
  }
  vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
}

const brokerServer = http.createServer((req, res) => { void handler(req, res, true).catch(() => json(res, 500, { error: '授权服务错误' })); });
brokerServer.listen(brokerPort, '127.0.0.1', () => console.log('模型授权服务已启动'));
const pcServer = http.createServer((req, res) => { void handler(req, res).catch(() => json(res, 500, { error: '本地服务错误' })); });
pcServer.listen(port, '127.0.0.1', () => {
  console.log(`有赞实时换装 · PC 入口：http://localhost:${port}`);
  console.log('服务已启动。未开启摄像头，未连接 Xmax；点击「开始试衣」才连接生成。');
});
let phoneServer;
if (tlsDir) {
  phoneServer = https.createServer({ key: readFileSync(path.join(tlsDir, 'server.key')), cert: readFileSync(path.join(tlsDir, 'server.crt')) },
    (req, res) => { void handler(req, res).catch(() => json(res, 500, { error: '本地服务错误' })); });
  phoneServer.listen(httpsPort, '0.0.0.0', () => console.log('手机入口已就绪；在 PC 页面点击「手机访问」查看二维码和证书说明。'));
}
for (const server of [pcServer, phoneServer, brokerServer].filter(Boolean)) server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? '端口被占用，请先关闭旧窗口里的服务或修改 .env 端口。' : '本地监听失败：' + error.code);
});
async function stopServer() {
  if (shutdown) return;
  shutdown = true;
  const forceExit = setTimeout(() => process.exit(1), 15000); forceExit.unref();
  await Promise.allSettled([...sessions.values()].map(revoke));
  await vite.close(); pcServer.close(); phoneServer?.close(); brokerServer.close();
  clearTimeout(forceExit); process.exit(0);
}
process.on('SIGINT', stopServer); process.on('SIGTERM', stopServer);
