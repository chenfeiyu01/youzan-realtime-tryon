export const isHosted = import.meta.env.MODE === 'pages';
const storageKey = 'youzan-demo-access';
let access;
let activeSession;
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
  if (validAccess()) {
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
  if (!isHosted) {
    const response = await fetch(route, { signal: AbortSignal.timeout(20000), ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '连接失败');
    return data;
  }
  if (route === '/api/config') return { configured: validAccess(), hosted: true,
    accessStatus: validAccess() ? 'valid' : access?.key ? 'expired' : 'missing',
    model: 'x2.1',
    phoneURLs: [], httpsAvailable: true, publicURL: location.origin + location.pathname };
  if (route === '/api/diagnostics') return { ok: true };
  if (route === '/api/share-link') return { url: shareURL(), expiresAt: access.expiresAt };
  if (route === '/api/session' && options.method === 'POST') {
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
