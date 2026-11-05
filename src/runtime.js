export const isHosted = import.meta.env.MODE === 'pages';
const connectionLimitSeconds = 20;
const storageKey = 'youzan-demo-access';
let access;
let activeSession;
if (isHosted) {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const key = fragment.get('xmax');
  if (key?.startsWith('tk-')) {
    access = { key, expiresAt: Number(fragment.get('expires')), pointsLimit: Number(fragment.get('limit')) || 60 };
    try { sessionStorage.setItem(storageKey, JSON.stringify(access)); } catch {}
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    try { access = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  }
}
function validAccess() { return access?.key?.startsWith('tk-') && Number.isFinite(access.expiresAt) && access.expiresAt > Date.now(); }
function shareURL() {
  if (!validAccess()) throw new Error('体验链接已过期');
  const url = new URL(location.pathname, location.origin);
  url.hash = new URLSearchParams({ xmax: access.key, expires: access.expiresAt, limit: access.pointsLimit }).toString();
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
    model: 'x2.1', durations: [10, 15, 30], connectionLimitSeconds,
    phoneURLs: [], httpsAvailable: true, publicURL: location.origin + location.pathname };
  if (route === '/api/diagnostics') return { ok: true };
  if (route === '/api/share-link') return { url: shareURL(), expiresAt: access.expiresAt };
  if (route === '/api/session' && options.method === 'POST') {
    if (!validAccess()) throw new Error('体验链接已过期，请获取新链接');
    if (activeSession) throw new Error('请先停止当前试衣');
    const { duration } = JSON.parse(options.body || '{}');
    if (![10, 15, 30].includes(duration)) throw new Error('请选择试衣时长');
    activeSession = { id: crypto.randomUUID().replaceAll('-', ''), temporaryApiKey: access.key,
      duration, connectionLimitSeconds };
    return activeSession;
  }
  if (route.startsWith('/api/session/')) {
    if (route.endsWith('/arm') || route.endsWith('/ready')) {
      if (!validAccess()) throw new Error('体验链接已过期');
      return { duration: activeSession?.duration, connectionLimitSeconds };
    }
    activeSession = undefined;
    return { stopped: true };
  }
  throw new Error('不支持的操作');
}
