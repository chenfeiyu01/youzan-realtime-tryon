import './style.css';
import { categories, wardrobe, categoryPrompts } from './wardrobe.js';
import { apiRequest, isHosted } from './runtime.js';
import { createCameraSource } from './camera.js';
import { modelOptions, modelFor, MAX_VIEWS } from './models.js';
import { createProviderSession, preloadProvider } from './providers.js';

const icons = {
  compare: '<rect x="3" y="4" width="7" height="16"/><path d="M14 4h7v16h-7M17.5 9v6M14.5 12h6"/>',
  window: '<path d="M14 3h7v7m0-7L11 13"/><path d="M10 3H3v18h18v-7"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1.5-3h5L16 6"/><circle cx="12" cy="13" r="4"/>',
  switch: '<path d="M4 8h14l-3-3M20 16H6l3 3"/><path d="M20 8a8 8 0 0 1 0 8M4 16a8 8 0 0 1 0-8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  hanger: '<path d="M9 6a3 3 0 1 1 5 2l-2 2v3L3 18a1 1 0 0 0 .5 2h17a1 1 0 0 0 .5-2l-9-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
document.querySelector('#app').innerHTML = `
  <header class="header">
    <div class="header-actions"><button class="icon-button" id="add-view" aria-label="添加对比窗口" title="添加对比窗口">${icon('compare')}</button><button class="icon-button" id="new-window" aria-label="打开独立窗口" title="打开独立窗口">${icon('window')}</button></div>
    <a class="brand" href="${location.href}" aria-label="有赞实时换装首页"><h1>有赞<span>实时换装</span></h1></a>
    <button class="icon-button" id="phone-button" aria-label="手机访问" title="手机访问">${icon('phone')}</button>
  </header>
  <main class="workspace">
    <section class="fitting" id="fitting" aria-label="实时试衣画面对比">
      <div class="views" id="views"></div>
      <div class="empty-state" id="empty-state"><button id="open-camera" class="light-button"><span>开启摄像头</span>${icon('arrow')}</button></div>
      <div class="controlbar"><button class="stage-tool" id="switch-camera" aria-label="切换前后摄像头" title="切换前后摄像头" disabled>${icon('switch')}</button><div class="session-controls"><button id="start-button" class="primary-button" disabled><span>开始试衣</span>${icon('arrow')}</button><button id="stop-button" class="stop-button" hidden><span>停止试衣</span>${icon('stop')}</button></div></div>
      <p id="notice" class="notice" role="status" aria-live="polite" hidden></p>
    </section>
    <aside class="wardrobe" aria-label="服饰选择">
      <div class="wardrobe-heading"><nav class="categories" id="categories" aria-label="服饰分类"></nav><button class="upload-button" id="upload-button" title="上传自己的衣服图片" aria-label="上传自己的衣服图片">${icon('plus')}<span>上传衣服</span></button></div>
      <div class="garments" id="garments"></div><input type="file" id="upload-input" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" aria-label="选择衣服图片" hidden />
    </aside>
  </main>
  <dialog id="phone-dialog"><button class="dialog-close icon-button" id="close-dialog" aria-label="关闭">${icon('close')}</button><h2>手机访问</h2><p>扫码打开</p><div id="phone-content"></div><details><summary>首次连接</summary><ol><li>将「有赞实时换装-手机证书.cer」发送到手机并安装。</li><li>iPhone：设置 → 通用 → 关于本机 → 证书信任设置，信任「Youzan Local Try-On CA」。Android：在安全设置中安装 CA 证书。</li><li>用 Safari 或 Chrome 扫码打开。</li></ol></details></dialog>
`;
const $ = selector => document.querySelector(selector);
let category = 'tops', selected = wardrobe[0], camera, cameraSource, cameraBusy = false, cameraFacing = 'user', config;
let selectionRevision = 0, updateDebounce;
const panes = [];
const syncRoom = new URLSearchParams(location.search).get('room') || crypto.randomUUID();
let clothingChannel;
const categoryScroll = new Map(), objectURLs = new Set();
const busy = pane => ['starting', 'live', 'stopping'].includes(pane.phase);
const active = () => panes.some(busy);
const request = apiRequest;
const configured = pane => Boolean(config?.providers?.[pane.model.provider] ?? (pane.model.provider === 'xmax' && config?.configured));
function closeCamera() { cameraSource?.close(); cameraSource = undefined; camera = undefined; }
function notice(text, error = false) { $('#notice').textContent = error ? text : ''; $('#notice').hidden = !error || !text; }
function configurationIssue(pane = panes[0]) {
  if (!config || configured(pane)) return '';
  if (isHosted && !config.providers?.decart && pane.model.provider === 'decart') return '请使用新版多模型体验链接，并保持电脑授权服务运行。';
  if (!isHosted) return `${pane.model.provider === 'decart' ? 'Decart' : 'Xmax'} 密钥尚未配置，请重启本地服务。`;
  return config.accessStatus === 'expired' ? '体验授权已过期，请打开新的体验链接。' : '此链接缺少授权，请打开完整体验链接。';
}
function errorText(error) {
  if (error?.name === 'NotAllowedError') return '请在浏览器地址栏允许摄像头。';
  if (error?.name === 'NotFoundError') return '没有找到摄像头。';
  if (error?.name === 'NotReadableError') return '摄像头正被其他应用占用。';
  return String(error?.message || '连接失败，请手动重试。').replace(/(?:dct_[a-zA-Z0-9_]+|(?:uk|tk)-[a-zA-Z0-9_-]+)/g, '[密钥已隐藏]').slice(0, 200);
}
function syncControls() {
  const running = active();
  $('#app').dataset.state = running ? 'live' : 'idle';
  $('#fitting').classList.toggle('has-camera', Boolean(camera));
  $('#fitting').dataset.count = panes.length;
  $('#views').style.setProperty('--view-count', panes.length);
  $('#empty-state').hidden = Boolean(camera);
  $('#start-button').hidden = running;
  $('#stop-button').hidden = !running;
  $('#start-button span').textContent = panes.length > 1 ? '开始对比' : '开始试衣';
  $('#stop-button span').textContent = panes.length > 1 ? '停止全部' : '停止试衣';
  $('#start-button').disabled = !camera || cameraBusy || !selected || !panes.some(p => configured(p) && p.phase === 'idle');
  $('#stop-button').disabled = panes.every(p => !busy(p) || p.phase === 'stopping');
  $('#switch-camera').disabled = running || cameraBusy || !camera;
  $('#open-camera').disabled = cameraBusy;
  $('#add-view').disabled = panes.length >= MAX_VIEWS;
  for (const pane of panes) {
    pane.element.dataset.phase = pane.phase;
    pane.element.classList.toggle('has-camera', Boolean(camera));
    pane.element.classList.toggle('has-output', pane.phase === 'live');
    pane.select.disabled = ['starting', 'stopping'].includes(pane.phase);
    pane.toggle.disabled = !camera || cameraBusy || !configured(pane) || pane.phase === 'stopping';
    pane.toggle.innerHTML = icon(busy(pane) ? 'stop' : 'play');
    pane.toggle.setAttribute('aria-label', busy(pane) ? '停止此窗口' : '开始此窗口');
    pane.toggle.title = configurationIssue(pane) || (busy(pane) ? '停止此窗口' : '开始此窗口');
    pane.remove.hidden = panes.length === 1;
    pane.status.hidden = pane.phase !== 'starting';
    pane.error.hidden = !pane.error.textContent;
  }
  updateSelection();
}
function updateSelection() {
  for (const button of $('#garments').children) {
    const chosen = button.dataset.itemId === selected?.id;
    const pending = chosen && panes.some(p => ['starting', 'live'].includes(p.phase) && p.appliedId !== selected.id && p.failedId !== selected.id);
    button.classList.toggle('selected', chosen); button.classList.toggle('is-applying', pending);
    button.setAttribute('aria-pressed', String(chosen)); button.setAttribute('aria-busy', String(pending));
  }
}
function addPane(modelId) {
  if (panes.length >= MAX_VIEWS) return;
  const model = modelFor(modelId) || modelOptions[0];
  const element = document.createElement('div'); element.className = 'stage model-pane';
  element.innerHTML = `<video class="camera-preview" autoplay playsinline muted aria-label="本地摄像头画面"></video><div class="sdk-output"></div><div class="pane-heading"><select class="model-select" aria-label="选择此窗口的模型"></select><div class="pane-actions"><button class="pane-toggle" aria-label="开始此窗口">${icon('play')}</button><button class="pane-remove" aria-label="关闭此窗口">${icon('close')}</button></div></div><div class="connection-message" hidden><span class="spinner"></span><span>连接中</span></div><p class="pane-error" role="status" hidden></p>`;
  const pane = { model, element, select: element.querySelector('select'), preview: element.querySelector('.camera-preview'), output: element.querySelector('.sdk-output'), toggle: element.querySelector('.pane-toggle'), remove: element.querySelector('.pane-remove'), status: element.querySelector('.connection-message'), error: element.querySelector('.pane-error'), phase: 'idle', run: 0, ready: false, queue: Promise.resolve() };
  for (const option of modelOptions) { const el = document.createElement('option'); el.value = option.id; el.textContent = option.label; pane.select.append(el); }
  pane.select.value = model.id;
  pane.select.onchange = async () => {
    const resume = busy(pane); const next = modelFor(pane.select.value);
    await stopPane(pane); if (pane.removing || !panes.includes(pane)) return;
    pane.model = next; pane.error.textContent = ''; syncControls();
    void preloadProvider(next.provider).catch(() => {});
    if (resume && camera && configured(pane)) void startPane(pane);
    else if (!configured(pane)) notice(configurationIssue(pane), true);
  };
  pane.toggle.onclick = () => busy(pane) ? void stopPane(pane) : void startPane(pane);
  pane.remove.onclick = async () => {
    if (panes.length <= 1 || pane.removing) return;
    pane.removing = true; pane.remove.disabled = true; await stopPane(pane);
    const index = panes.indexOf(pane);
    if (index >= 0 && panes.length > 1) { panes.splice(index, 1); element.remove(); }
    else { pane.removing = false; pane.remove.disabled = false; }
    syncControls();
  };
  panes.push(pane); $('#views').append(element);
  if (camera) { pane.preview.srcObject = camera; pane.preview.classList.toggle('mirrored', cameraFacing === 'user'); void pane.preview.play().catch(() => {}); }
  syncControls(); return pane;
}
async function startPane(pane) {
  if (!camera || !selected || busy(pane) || !configured(pane) || pane.removing || !panes.includes(pane)) return;
  const run = ++pane.run, item = selected;
  pane.phase = 'starting'; pane.appliedId = undefined; pane.failedId = undefined; pane.ready = false; pane.error.textContent = '';
  const current = () => pane.run === run && panes.includes(pane);
  const adapter = createProviderSession({ model: pane.model, stream: camera, format: cameraSource.format, output: pane.output, mirrored: cameraFacing === 'user',
    onLive: () => { if (current() && pane.phase !== 'stopping') { pane.phase = 'live'; syncControls(); } },
    onError: error => { if (current()) { pane.error.textContent = errorText(error); void stopPane(pane); } },
  });
  pane.adapter = adapter; syncControls();
  try {
    await adapter.start(item);
    if (!current()) return;
    pane.ready = true; pane.appliedId = item.id; syncControls();
    if (item.id !== selected.id) queueUpdate(pane);
  } catch (error) {
    if (current()) { pane.error.textContent = errorText(error); await stopPane(pane); }
  }
}
async function stopPane(pane) {
  if (pane.stopping) return pane.stopping;
  ++pane.run; pane.ready = false; pane.phase = 'stopping'; syncControls();
  const adapter = pane.adapter; pane.adapter = undefined;
  pane.stopping = (async () => {
    try { await adapter?.close(); } catch (error) { pane.error.textContent = errorText(error); }
    pane.output.replaceChildren(); pane.appliedId = undefined; pane.queue = Promise.resolve(); pane.phase = 'idle';
  })().finally(() => { pane.stopping = undefined; syncControls(); });
  return pane.stopping;
}
function queueUpdate(pane) {
  const item = selected, revision = selectionRevision, run = pane.run;
  pane.queue = pane.queue.catch(() => {}).then(async () => {
    if (pane.phase !== 'live' || !pane.ready || pane.run !== run || revision !== selectionRevision || pane.appliedId === item.id) return;
    try {
      await pane.adapter.update(item);
      if (pane.run === run) { pane.appliedId = item.id; pane.failedId = undefined; pane.error.textContent = ''; }
    } catch (error) { if (pane.run === run) { pane.failedId = item.id; pane.error.textContent = errorText(error); } }
    finally { syncControls(); }
  });
}
function selectItem(item, broadcast = true) {
  if (selected?.id === item.id && !panes.some(p => p.failedId === item.id)) return;
  selected = item; ++selectionRevision;
  try { localStorage.setItem('youzan-selected-item', item.id); } catch {}
  for (const pane of panes) pane.failedId = undefined;
  clearTimeout(updateDebounce); updateDebounce = setTimeout(() => panes.forEach(queueUpdate), 180);
  syncControls();
  if (broadcast) sendItem(item);
}
function sendItem(item) {
  clothingChannel?.postMessage({ type: 'selection', item: { id: item.id, category: item.category, name: item.name, image: item.file ? undefined : item.image, remote: item.remote, prompt: item.prompt, file: item.file } });
}
async function openCamera() {
  if (cameraBusy || active()) return;
  cameraBusy = true; syncControls(); closeCamera();
  for (const pane of panes) void preloadProvider(pane.model.provider).catch(() => {});
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('请使用 Safari 或 Chrome 的 HTTPS 页面');
    cameraSource = await createCameraSource(cameraFacing); camera = cameraSource.stream;
    if (document.hidden) { closeCamera(); return; }
    for (const pane of panes) {
      pane.preview.srcObject = camera; pane.preview.classList.toggle('mirrored', cameraFacing === 'user'); await pane.preview.play();
    }
    const problem = panes.map(p => configurationIssue(p)).filter(Boolean)[0]; notice(problem, Boolean(problem));
  } catch (error) { closeCamera(); notice(errorText(error), true); }
  finally { cameraBusy = false; syncControls(); }
}
function renderWardrobe() {
  if (!$('#categories').children.length) {
    $('#categories').replaceChildren(...categories.map(([key, label]) => {
      const button = document.createElement('button'); button.textContent = label; button.dataset.category = key;
      button.onclick = () => {
        if (category === key) return;
        categoryScroll.set(category, $('#garments').scrollTop);
        category = key; renderWardrobe();
      };
      return button;
    }));
  }
  for (const button of $('#categories').children) {
    const chosen = button.dataset.category === category;
    button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
  }
  $('#garments').replaceChildren(...wardrobe.filter(item => item.category === category).map((item, index) => {
    const button = document.createElement('button');
    button.dataset.itemId = item.id;
    button.style.setProperty('--arrival', `${Math.min(index, 5) * 25}ms`);
    button.className = `garment ${item.id === selected?.id ? 'selected' : ''}`;
    button.setAttribute('aria-pressed', String(item.id === selected?.id));
    button.setAttribute('aria-label', `试穿${item.name}`);
    const picture = document.createElement('div'); picture.className = 'garment-picture';
    const image = document.createElement('img'); image.src = item.image; image.alt = item.name; image.loading = 'lazy';
    image.decoding = 'async';
    image.onload = () => picture.classList.add('is-loaded');
    if (image.complete && image.naturalWidth) picture.classList.add('is-loaded');
    image.onerror = () => { if (item.remote && image.src !== item.remote) image.src = item.remote; else picture.classList.add('image-unavailable'); };
    const mark = document.createElement('span'); mark.className = 'selection-mark'; mark.innerHTML = icon('check');
    picture.append(image, mark);
    button.title = item.name;
    button.append(picture);
    button.onclick = () => selectItem(item);
    return button;
  }));
  $('#garments').scrollTop = categoryScroll.get(category) || 0;
  updateSelection();
}
$('#open-camera').onclick = openCamera;
$('#start-button').onclick = () => { for (const pane of panes) if (!busy(pane) && configured(pane)) void startPane(pane); };
$('#stop-button').onclick = () => { for (const pane of panes) if (busy(pane)) void stopPane(pane); };
$('#switch-camera').onclick = async () => { if (!active()) { cameraFacing = cameraFacing === 'user' ? 'environment' : 'user'; await openCamera(); } };
$('#add-view').onclick = () => addPane(panes.some(p => p.model.provider === 'xmax') ? 'decart-vton-3.6' : 'xmax-2.1');
$('#new-window').onclick = () => {
  const url = new URL(location.href); url.searchParams.set('model', panes[0].model.id); url.searchParams.set('item', selected.id);
  url.searchParams.set('room', syncRoom);
  window.open(url.href, '_blank', 'popup,width=1000,height=850,noopener,noreferrer');
};
$('#upload-button').onclick = () => $('#upload-input').click();
$('#upload-input').onchange = async event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  const mime = file.type || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[file.name.split('.').pop().toLowerCase()]);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !file.size || file.size > 10 * 1024 * 1024) { notice('请选择 10 MB 以内的 JPG、PNG 或 WebP 衣服图片。', true); return; }
  const uploadCategory = category;
  const normalized = file.type ? file : new File([file], file.name, { type: mime });
  const image = URL.createObjectURL(normalized);
  const button = $('#upload-button'); button.disabled = true; button.setAttribute('aria-busy', 'true'); button.querySelector('span').textContent = '读取中';
  try {
    const preview = new Image(); preview.src = image; await preview.decode();
    if (!preview.naturalWidth || !preview.naturalHeight) throw new Error('无法读取图片');
    objectURLs.add(image);
    const item = { id: crypto.randomUUID(), category: uploadCategory, name: file.name.replace(/\.[^.]+$/, '').slice(0, 20), image, file: normalized, prompt: categoryPrompts[uploadCategory] };
    wardrobe.unshift(item); category = uploadCategory; selectItem(item); categoryScroll.set(category, 0); renderWardrobe();
    const problem = configurationIssue(); notice(problem, Boolean(problem));
  } catch {
    URL.revokeObjectURL(image); notice('图片无法读取，请换一张 JPG、PNG 或 WebP 图片。', true);
  } finally {
    button.disabled = false; button.removeAttribute('aria-busy'); button.querySelector('span').textContent = '上传衣服';
  }
};
$('#close-dialog').onclick = () => $('#phone-dialog').close();
$('#phone-dialog').onclick = event => { if (event.target === $('#phone-dialog')) $('#phone-dialog').close(); };
$('#phone-button').onclick = async () => {
  const content = $('#phone-content'); content.replaceChildren();
  $('#phone-dialog details').hidden = Boolean(config?.publicURL || isHosted);
  $('#phone-dialog > p').textContent = config?.publicURL || isHosted ? '扫码打开' : '连接同一 Wi-Fi 后扫码';
  if (config?.publicURL || isHosted) {
    try {
      const share = await request('/api/share-link', { method: 'POST', body: '{}' });
      const QRCode = await import('qrcode');
      const image = document.createElement('img');
      image.src = await QRCode.default.toDataURL(share.url, { margin: 1, width: 240, color: { dark: '#272a25', light: '#ffffff' } });
      image.className = 'qr-code'; image.alt = '手机体验二维码'; content.append(image);
      const link = document.createElement('a'); link.href = share.url; link.textContent = '打开体验';
      link.target = '_blank'; link.rel = 'noreferrer'; link.className = 'phone-url'; content.append(link);
      const copy = document.createElement('button'); copy.className = 'copy-button'; copy.textContent = '复制链接';
      copy.onclick = async () => { await navigator.clipboard.writeText(share.url); copy.textContent = '已复制'; }; content.append(copy);
      $('#phone-dialog').showModal();
    } catch (error) { notice(errorText(error), true); }
    return;
  }
  if (!config?.phoneURLs?.length || !config.httpsAvailable) {
    const p = document.createElement('p'); p.textContent = '请在电脑端获取二维码'; content.append(p);
  } else {
    const image = document.createElement('img'); image.src = '/api/phone-qr?index=0'; image.className = 'qr-code'; image.alt = '同一 Wi-Fi 下的手机访问二维码'; content.append(image);
    if (config.phoneURLs.length > 1) {
      const select = document.createElement('select'); select.setAttribute('aria-label', '选择电脑的局域网地址');
      config.phoneURLs.forEach((url, index) => { const option = document.createElement('option'); option.value = index; option.textContent = new URL(url).hostname; select.append(option); });
      select.onchange = () => { image.src = `/api/phone-qr?index=${select.value}`; link.href = config.phoneURLs[select.value]; link.textContent = new URL(link.href).origin; };
      content.append(select);
    }
    const link = document.createElement('a'); link.href = config.phoneURLs[0]; link.textContent = new URL(link.href).origin; link.target = '_blank'; link.rel = 'noreferrer'; link.className = 'phone-url'; content.append(link);
    const copy = document.createElement('button'); copy.className = 'copy-button'; copy.textContent = '复制手机访问链接';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(link.href); copy.textContent = '已复制'; } catch { notice('复制失败，请扫码', true); } };
    content.append(copy);
  }
  $('#phone-dialog').showModal();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    for (const pane of panes) { if (busy(pane)) void stopPane(pane); pane.preview.srcObject = null; }
    closeCamera(); syncControls();
  }
});
window.addEventListener('pagehide', () => {
  clearTimeout(updateDebounce); for (const pane of panes) void stopPane(pane);
  clothingChannel?.close();
  closeCamera(); objectURLs.forEach(url => URL.revokeObjectURL(url));
});
const initial = new URLSearchParams(location.search);
let remembered;
try { remembered = localStorage.getItem('youzan-selected-item'); } catch {}
selected = wardrobe.find(item => item.id === (initial.get('item') || remembered)) || wardrobe[0]; category = selected.category;
renderWardrobe(); addPane(initial.get('model') || 'xmax-2.1');
try {
  clothingChannel = new BroadcastChannel(`youzan-fitting-${syncRoom}`);
  clothingChannel.onmessage = ({ data }) => {
    if (data?.type === 'request') { const item = wardrobe.find(item => item.id === data.id); if (item) sendItem(item); return; }
    if (data?.type !== 'selection' || !data.item || data.item.id === selected.id) return;
    let item = wardrobe.find(item => item.id === data.item.id);
    if (!item && data.item.file instanceof Blob && data.item.file.size <= 10 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(data.item.file.type)) {
      const image = URL.createObjectURL(data.item.file); objectURLs.add(image);
      item = { ...data.item, image }; wardrobe.unshift(item);
    }
    if (item) { category = item.category; selectItem(item, false); renderWardrobe(); }
  };
  if (initial.get('item')) clothingChannel.postMessage({ type: 'request', id: initial.get('item') });
} catch {}
request('/api/config').then(value => {
  config = value; syncControls();
  const problem = configurationIssue(); if (problem) notice(problem, true);
}).catch(error => notice(isHosted ? '电脑授权服务未连接，请保持电脑上的应用和公网连接运行后刷新。' : errorText(error), true));
