export const isHosted = import.meta.env.MODE === 'pages';
const storageKey = 'youzan-demo-access';
let access;
let activeSession;
let bridge;
if (isHosted) {
  const params = new URLSearchParams(location.search);
  const url = params.get('bridge'), grant = params.get('grant');
  if (url && grant && /^[a-f0-9]{64}$/.test(grant)) {
    try {
      const endpoint = new URL(url);
      if (endpoint.protocol === 'https:' && endpoint.hostname.endsWith('.trycloudflare.com')) bridge = { url: endpoint.origin, grant };
    } catch {}
  }
  if (!bridge) {
    try {
      const saved = JSON.parse(localStorage.getItem('youzan-model-bridge'));
      const endpoint = new URL(saved?.url);
      if (endpoint.protocol === 'https:' && endpoint.hostname.endsWith('.trycloudflare.com') && /^[a-f0-9]{64}$/.test(saved.grant)) bridge = { url: endpoint.origin, grant: saved.grant };
    } catch {}
  }
  if (bridge) {
    try { localStorage.setItem('youzan-model-bridge', JSON.stringify(bridge)); } catch {}
    const current = new URL(location.href);
    current.searchParams.set('bridge', bridge.url); current.searchParams.set('grant', bridge.grant);
    for (const key of ['xmax', 'expires', 'limit']) current.searchParams.delete(key);
    try { history.replaceState(null, '', current.href); } catch {}
  }
}
if (isHosted) {
  const fromParams = params => {
    const key = params.get('xmax');
    return key?.startsWith('tk-')
      ? { key, expiresAt: Number(params.get('expires')), pointsLimit: Number(params.get('limit')) || 60 }
      : undefined;
  };
  const candidates = [fromParams(new URLSearchParams(location.search)), fromParams(new URLSearchParams(location.hash.slice(1)))];
  for (const storage of ['sessionStorage', 'localStorage']) {
    try { candidates.push(JSON.parse(window[storage].getItem(storageKey))); } catch {}
  }
  access = candidates.find(value => value?.key?.startsWith('tk-') && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now())
    || candidates.find(value => value?.key?.startsWith('tk-'));
  if (validAccess() && !bridge) {
    for (const storage of ['sessionStorage', 'localStorage']) {
      try { window[storage].setItem(storageKey, JSON.stringify(access)); } catch {}
    }
    const url = new URL(location.href);
    url.searchParams.set('xmax', access.key);
    url.searchParams.set('expires', access.expiresAt);
    url.searchParams.set('limit', access.pointsLimit);
    url.hash = '';
    try { history.replaceState(null, '', url.href); } catch {}
  }
}
function validAccess() { return Boolean(access?.key?.startsWith('tk-') && Number.isFinite(access.expiresAt) && access.expiresAt > Date.now()); }
function shareURL() {
  if (!validAccess()) throw new Error('体验链接已过期');
  const url = new URL(location.pathname, location.origin);
  url.search = new URLSearchParams({ xmax: access.key, expires: access.expiresAt, limit: access.pointsLimit }).toString();
  return url.href;
}
export async function apiRequest(route, options = {}) {
  if (!isHosted || bridge) {
    const response = await fetch(bridge ? bridge.url + route : route, { signal: AbortSignal.timeout(20000), ...options,
      headers: { 'Content-Type': 'application/json', ...(bridge ? { Authorization: `Bearer ${bridge.grant}` } : {}), ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '连接失败');
    return data;
  }
  if (route === '/api/config') return { configured: validAccess(), hosted: true,
    accessStatus: validAccess() ? 'valid' : access?.key ? 'expired' : 'missing',
    providers: { xmax: validAccess(), decart: false }, maxViews: 1,
    phoneURLs: [], httpsAvailable: true, publicURL: location.origin + location.pathname };
  if (route === '/api/diagnostics') return { ok: true };
  if (route === '/api/share-link') return { url: shareURL(), expiresAt: access.expiresAt };
  if (route === '/api/session' && options.method === 'POST') {
    const { modelId } = JSON.parse(options.body || '{}');
    if (modelId && modelId !== 'xmax-2.1') throw new Error('请使用新版多模型体验链接');
    if (!validAccess()) throw new Error('体验链接已过期，请获取新链接');
    if (activeSession) throw new Error('请先停止当前试衣');
    activeSession = { id: crypto.randomUUID().replaceAll('-', ''), temporaryApiKey: access.key };
    return activeSession;
  }
  if (route.startsWith('/api/session/')) {
    if (route.endsWith('/arm') || route.endsWith('/ready')) {
      if (!validAccess()) throw new Error('体验链接已过期');
      return { ready: true };
    }
    activeSession = undefined;
    return { stopped: true };
  }
  throw new Error('不支持的操作');
}
