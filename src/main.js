import './style.css';
import { categories, wardrobe, categoryPrompts } from './wardrobe.js';
import { apiRequest, isHosted } from './runtime.js';

const icons = {
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
    <a class="brand" href="/" aria-label="有赞实时换装首页"><h1>有赞实时换装</h1></a>
    <button class="icon-button" id="phone-button" aria-label="手机访问" title="手机访问">${icon('phone')}</button>
  </header>
  <main class="workspace">
    <section class="fitting" aria-label="实时试衣画面">
      <div class="stage" id="stage">
        <video id="camera-preview" autoplay playsinline muted aria-label="本地摄像头画面"></video>
        <div class="sdk-output" id="sdk-output" aria-label="AI 实时换装画面"></div>
        <div class="stage-top"><span class="stage-status" id="stage-status" hidden><i></i></span><button class="stage-tool" id="switch-camera" aria-label="切换前后摄像头" title="切换前后摄像头" disabled>${icon('switch')}</button></div>
        <div class="empty-state" id="empty-state"><button id="open-camera" class="light-button">${icon('camera')}开启摄像头</button></div>
        <div class="connection-message" id="connection-message" hidden><span class="spinner"></span><span>连接中</span></div>
      </div>
      <div class="controlbar">
        <div class="session-controls"><select id="duration" aria-label="自动停止时长" title="自动停止时长"><option value="10">10 秒</option><option value="15" selected>15 秒</option><option value="30">30 秒</option></select><span class="countdown" id="countdown" hidden>00:15</span><button id="start-button" class="primary-button" disabled>${icon('play')}<span>开始试衣</span></button><button id="stop-button" class="stop-button" hidden>${icon('stop')}<span>停止试衣</span></button></div>
      </div>
      <p id="notice" class="notice" role="status" aria-live="polite" hidden></p>
    </section>
    <aside class="wardrobe" aria-label="服饰选择">
      <div class="wardrobe-heading"><nav class="categories" id="categories" aria-label="服饰分类"></nav><button class="icon-button" id="upload-button" title="上传商品图" aria-label="上传商品图">${icon('plus')}</button></div>
      <div class="garments" id="garments"></div>
      <input type="file" id="upload-input" accept="image/jpeg,image/png,image/webp" hidden />
    </aside>
  </main>
  <dialog id="phone-dialog"><button class="dialog-close icon-button" id="close-dialog" aria-label="关闭">${icon('close')}</button><h2>手机访问</h2><p>连接同一 Wi-Fi 后扫码</p><div id="phone-content"></div><details><summary>首次连接</summary><ol><li>将「有赞实时换装-手机证书.cer」发送到手机并安装。</li><li>iPhone：设置 → 通用 → 关于本机 → 证书信任设置，信任「Youzan Local Try-On CA」。Android：在安全设置中安装 CA 证书。</li><li>用 Safari 或 Chrome 扫码打开。</li></ol></details></dialog>
`;
const $ = selector => document.querySelector(selector);
let category = 'tops';
let selected = wardrobe[0];
let appliedId;
let camera;
let cameraBusy = false;
let cameraFacing = 'user';
let config;
let sdk;
let client;
let manager;
let localStream;
let outputView;
let session;
let phase = 'idle';
let generation = 0;
let selectionRevision = 0;
let updateQueue = Promise.resolve();
let timer;
let deadline = 0;
let stopping;
let connectionTimer;
let updateDebounce;
let sdkPromise;
const loadSDK = () => sdkPromise ||= import('@xmaxai/web-sdk');
const trace = (event, fields = {}) => {
  void request('/api/diagnostics', { method: 'POST', body: JSON.stringify({ event, ...fields }) }).catch(() => {});
};
const uploaded = new Map();
const objectURLs = new Set();
const active = () => phase === 'starting' || phase === 'live';
function notice(text, error = false) { $('#notice').textContent = error ? text : ''; $('#notice').hidden = !error || !text; $('#notice').classList.toggle('error', error); }
function stageStatus(text, live = false) { $('#stage-status').hidden = !live; $('#stage-status').setAttribute('aria-label', text); $('#stage-status').classList.toggle('live', live); }
function errorText(error) {
  if (error?.name === 'NotAllowedError') return '摄像头权限未开启，请在浏览器地址栏允许摄像头。';
  if (error?.name === 'NotFoundError') return '没有找到摄像头，请检查设备连接。';
  if (error?.name === 'NotReadableError') return '摄像头可能正被其他应用占用，请关闭占用它的应用后重试。';
  const raw = String(error?.message || '连接未成功，请手动重试。');
  return raw.replace(/(?:uk|tk)-[a-zA-Z0-9_-]+/g, '[密钥已隐藏]').slice(0, 240);
}
function syncControls() {
  const running = active();
  $('#start-button').hidden = running || phase === 'stopping';
  $('#stop-button').hidden = !running && phase !== 'stopping';
  $('#stop-button').disabled = phase === 'stopping';
  $('#stop-button span').textContent = phase === 'stopping' ? '正在停止' : '停止试衣';
  $('#start-button').disabled = !camera || !selected || !config?.configured || cameraBusy || Boolean(session) || phase !== 'idle';
  $('#duration').disabled = running || phase === 'stopping';
  $('#switch-camera').disabled = running || phase === 'stopping' || cameraBusy || !camera;
  $('#open-camera').disabled = cameraBusy;
  $('#countdown').hidden = phase !== 'live';
}
function renderWardrobe() {
  $('#categories').replaceChildren(...categories.map(([key, label]) => {
    const button = document.createElement('button');
    button.textContent = label; button.className = key === category ? 'selected' : '';
    button.setAttribute('aria-pressed', String(key === category));
    button.onclick = () => { category = key; renderWardrobe(); };
    return button;
  }));
  $('#garments').replaceChildren(...wardrobe.filter(item => item.category === category).map(item => {
    const button = document.createElement('button');
    button.className = `garment ${item.id === selected?.id ? 'selected' : ''}`;
    button.setAttribute('aria-pressed', String(item.id === selected?.id));
    button.setAttribute('aria-label', `试穿${item.name}`);
    const picture = document.createElement('div'); picture.className = 'garment-picture';
    const image = document.createElement('img'); image.src = item.image; image.alt = item.name; image.loading = 'lazy';
    image.onerror = () => { if (item.remote && image.src !== item.remote) image.src = item.remote; else picture.classList.add('image-unavailable'); };
    const mark = document.createElement('span'); mark.className = 'selection-mark'; mark.innerHTML = icon('check');
    picture.append(image, mark);
    button.title = item.name;
    button.append(picture);
    button.onclick = () => selectItem(item);
    return button;
  }));
}
function selectItem(item) {
  selected = item; ++selectionRevision; renderWardrobe(); syncControls();
  if (phase === 'live') { clearTimeout(updateDebounce); updateDebounce = setTimeout(queueUpdate, 180); }
  else notice('');
}
async function request(route, options = {}) {
  return apiRequest(route, options);
}
async function openCamera() {
  if (cameraBusy || active() || phase === 'stopping') return;
  cameraBusy = true; syncControls();
  void loadSDK().catch(() => { sdkPromise = undefined; });
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('请使用 Safari 或 Chrome 的 HTTPS 页面');
    camera?.getTracks().forEach(track => track.stop());
    const mobile = matchMedia('(max-width: 760px)').matches;
    camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: cameraFacing }, width: { ideal: mobile ? 720 : 1280 },
      height: { ideal: mobile ? 1280 : 720 }, frameRate: { ideal: 20, max: 24 },
    } });
    if (document.hidden) { camera.getTracks().forEach(track => track.stop()); camera = undefined; return; }
    const video = $('#camera-preview'); video.srcObject = camera;
    video.classList.toggle('mirrored', cameraFacing === 'user');
    await video.play();
    $('#stage').classList.add('has-camera'); $('#empty-state').hidden = true;
    stageStatus('本地预览'); notice('');
  } catch (error) { camera?.getTracks().forEach(track => track.stop()); camera = undefined; notice(errorText(error), true); }
  finally { cameraBusy = false; syncControls(); }
}
async function referenceFor(item, ownClient) {
  if (item.remote) return item.remote;
  if (uploaded.has(item.id)) return uploaded.get(item.id);
  const data = item.file || await fetch(item.image).then(response => {
    if (!response.ok) throw new Error('服饰参考图未能加载，请换一件或上传自己的商品图。');
    return response.blob();
  });
  const result = await ownClient.createStorageService().uploadImage({ data, fileName: item.file?.name || `${item.id}.webp`, contentType: data.type || 'image/webp' });
  uploaded.set(item.id, result.url); return result.url;
}
function assertCurrent(run) { if (run !== generation || !active() || document.hidden) throw new DOMException('已取消本次试衣', 'AbortError'); }
function connection() { $('#connection-message').hidden = false; }
function startCountdown(seconds) {
  deadline = Date.now() + seconds * 1000;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    $('#countdown').textContent = `00:${String(remaining).padStart(2, '0')}`;
    $('#countdown').classList.toggle('ending', remaining <= 5);
    if (!remaining) void stop('已到设定时长，试衣已停止。');
  };
  tick(); timer = setInterval(tick, 200);
}
async function start() {
  if (!camera || active() || phase !== 'idle' || session || !selected) return;
  const run = ++generation;
  const startedAt = performance.now();
  let step = 'sdk';
  let playbackStarted = false;
  trace('prepare');
  phase = 'starting'; appliedId = undefined; syncControls();
  stageStatus('准备连接'); connection('正在准备试衣…'); notice('');
  let issued;
  try {
    sdk ||= await loadSDK(); assertCurrent(run);
    step = 'credential';
    issued = await request('/api/session', { method: 'POST', body: JSON.stringify({ duration: Number($('#duration').value) }) });
    if (run !== generation || !active() || document.hidden) {
      await request(`/api/session/${issued.id}`, { method: 'DELETE' }); return;
    }
    session = issued;
    client = new sdk.XmaxClient(new sdk.XmaxConfiguration({ apiKey: issued.temporaryApiKey, environment: sdk.XmaxEnvironment.china, loggerOptions: sdk.XmaxLoggerOption.none }));
    manager = client.createRealtimeManager(new sdk.RealtimeConfiguration({ model: sdk.RealtimeModel.x2_1 }));
    const thisManager = manager;
    await manager.setStateListener(state => {
      if (thisManager !== manager || run !== generation || !active()) return;
      if (state.reason?.kind === 'failure') {
        trace('error', { stage: state.connectionState, code: Number(state.reason.error.code), ms: performance.now() - startedAt });
        notice(errorText(state.reason.error), true); void stop('', true); return;
      }
      if (state.connectionState === sdk.RealtimeConnectionState.generating) {
        phase = 'live'; $('#stage').classList.add('has-output'); $('#connection-message').hidden = true;
        if (!playbackStarted) {
          playbackStarted = true; clearTimeout(connectionTimer);
          startCountdown(issued.duration);
          trace('frame', { ms: performance.now() - startedAt });
          void request(`/api/session/${issued.id}/ready`, { method: 'POST', body: '{}' }).catch(error => {
            if (run !== generation) return;
            notice(errorText(error), true); void stop('', true);
          });
        }
        stageStatus('实时试衣中', true); notice(''); syncControls();
        if (selected?.id !== appliedId) queueUpdate();
      }
    });
    step = 'reference';
    const initialItem = selected;
    connection('正在准备服饰参考图…');
    const referencePath = await referenceFor(initialItem, client); assertCurrent(run);
    const track = camera.getVideoTracks()[0];
    const settings = track.getSettings();
    step = 'rtc';
    localStream = await manager.createExternalVideoStream({ videoTrack: track,
      videoFormat: new sdk.RealtimeVideoFormat({ width: settings.width || 1280, height: settings.height || 720,
        fps: Math.min(settings.frameRate || 20, 24), minimumBitrate: 300, maximumBitrate: 1600 }) });
    assertCurrent(run);
    outputView = new sdk.XmaxRealtimeVideoView({ videoContentMode: sdk.VideoContentMode.fit, isInteractionEnabled: false, fadeInDurationMs: 0 });
    outputView.isMirrored = cameraFacing === 'user';
    outputView.element.style.cssText = 'width:100%;height:100%;background:transparent'; outputView.attach($('#sdk-output'));
    await request(`/api/session/${session.id}/arm`, { method: 'POST', body: '{}' }); assertCurrent(run);
    step = 'connecting'; trace('connect', { ms: performance.now() - startedAt }); connection();
    connectionTimer = setTimeout(() => {
      if (run !== generation || playbackStarted) return;
      trace('error', { stage: 'first_frame_timeout', ms: performance.now() - startedAt });
      notice('连接超时，请停止后重试', true); void stop('', true);
    }, issued.connectionLimitSeconds * 1000);
    const result = await manager.startGeneration({ localStream,
      context: new sdk.RealtimeContext({ prompt: initialItem.prompt, referencePath }), faceRestoration: true });
    assertCurrent(run); appliedId = initialItem.id; outputView.track = result.videoTrack; syncControls();
  } catch (error) {
    if (run !== generation) return;
    trace('error', { stage: step, code: Number(error.code), ms: performance.now() - startedAt });
    const message = errorText(error); await stop('', true); notice(message, true);
  }
}
function queueUpdate() {
  const item = selected; const revision = selectionRevision; const run = generation;
  updateQueue = updateQueue.catch(() => {}).then(async () => {
    if (phase !== 'live' || run !== generation || revision !== selectionRevision || item.id === appliedId) return;
    try {
      notice('');
      const referencePath = await referenceFor(item, client);
      if (phase !== 'live' || run !== generation || revision !== selectionRevision) return;
      const currentManager = manager;
      const result = await currentManager.startGeneration({ localStream,
        context: new sdk.RealtimeContext({ prompt: item.prompt, referencePath }), faceRestoration: true });
      if (run !== generation || phase !== 'live') return;
      outputView.track = result.videoTrack; appliedId = item.id;
      if (revision === selectionRevision) notice('');
    } catch (error) {
      if (run === generation && active()) {
        trace('error', { stage: 'update', code: Number(error.code) });
        notice(errorText(error), true);
        if (manager?.currentState.connectionState === sdk.RealtimeConnectionState.idle) await stop('', true);
      }
    }
    finally { syncControls(); }
  });
}
async function stop(message = '试衣已停止。', preserveError = false) {
  if (stopping) return stopping;
  ++generation; phase = 'stopping'; clearInterval(timer); clearTimeout(connectionTimer); clearTimeout(updateDebounce); timer = undefined; deadline = 0;
  const oldManager = manager; const oldSession = session;
  manager = undefined; client = undefined; localStream = undefined;
  outputView?.detach(); outputView = undefined; updateQueue = Promise.resolve();
  $('#connection-message').hidden = true; $('#stage').classList.remove('has-output'); syncControls();
  stopping = (async () => {
    let cleanupTimeout;
    const close = oldManager ? Promise.race([
      oldManager.close(),
      new Promise((_, reject) => { cleanupTimeout = setTimeout(() => reject(new Error('关闭超时')), 5000); }),
    ]).finally(() => clearTimeout(cleanupTimeout)) : Promise.resolve();
    const results = await Promise.allSettled([close]);
    results.push((await Promise.allSettled([
      oldSession ? request(`/api/session/${oldSession.id}`, { method: 'DELETE' }) : Promise.resolve(),
    ]))[0]);
    session = results[1].status === 'fulfilled' ? undefined : oldSession;
    phase = 'idle'; appliedId = undefined;
    stageStatus(camera ? '本地预览' : '试衣间已就绪');
    if (session) {
      notice('本地画面已停止，服务端关闭尚未确认；后台会继续停用凭证，当前不会重新开始。请稍后刷新。', true);
    } else if (results[0].status === 'rejected') {
      notice(isHosted ? '连接关闭未确认，请关闭此页面' : 'Xmax 凭证已停用；视频资源释放未确认，请刷新页面。', true);
    } else if (message && !preserveError) notice(message);
  })().finally(() => { stopping = undefined; syncControls(); });
  return stopping;
}
$('#open-camera').onclick = openCamera;
$('#start-button').onclick = start;
$('#stop-button').onclick = () => void stop();
$('#switch-camera').onclick = async () => { if (!active()) { cameraFacing = cameraFacing === 'user' ? 'environment' : 'user'; await openCamera(); } };
$('#upload-button').onclick = () => $('#upload-input').click();
$('#upload-input').onchange = async event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { notice('请选择 10 MB 以内的 JPG、PNG 或 WebP 商品图。', true); return; }
  const image = URL.createObjectURL(file); objectURLs.add(image);
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 20);
  const item = { id: crypto.randomUUID(), category, name, detail: '我的商品图', image, file, prompt: categoryPrompts[category] };
  wardrobe.unshift(item); selectItem(item);
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
    if (active()) void stop('切换到后台，试衣已自动停止。');
    camera?.getTracks().forEach(track => track.stop()); camera = undefined; $('#camera-preview').srcObject = null;
    $('#stage').classList.remove('has-camera'); $('#empty-state').hidden = false; syncControls();
  }
});
window.addEventListener('pagehide', () => {
  ++generation; clearInterval(timer);
  if (session && !isHosted) navigator.sendBeacon(`/api/session/${session.id}`, new Blob(['{}'], { type: 'application/json' }));
  void manager?.close().catch(() => {});
  camera?.getTracks().forEach(track => track.stop()); objectURLs.forEach(url => URL.revokeObjectURL(url));
});
renderWardrobe(); syncControls();
void loadSDK().catch(() => { sdkPromise = undefined; });
request('/api/config').then(value => {
  config = value; syncControls();
  if (!config.configured) notice(isHosted ? '请使用有效的体验链接打开' : '本地 API Key 尚未配置，请填写 .env 后重启服务。', true);
}).catch(error => notice(errorText(error), true));
