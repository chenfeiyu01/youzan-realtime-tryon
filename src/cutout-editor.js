import { cutoutImage } from './runtime.js';
const loadImage = async url => { const image = new Image(); image.src = url; await image.decode(); return image; };
const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片导出失败')), 'image/jpeg', .94));

export async function editGarmentImage(file) {
  const urls = new Set();
  const makeURL = blob => { const url = URL.createObjectURL(blob); urls.add(url); return url; };
  const sourceURL = makeURL(file);
  let original;
  try { original = await loadImage(sourceURL); }
  catch { URL.revokeObjectURL(sourceURL); throw new Error('图片无法读取，请换一张图片'); }
  const dialog = document.createElement('dialog'); dialog.className = 'cutout-dialog';
  dialog.setAttribute('aria-label', '处理衣服图片');
  dialog.innerHTML = `<div class="cutout-heading"><h2>处理衣服</h2><button class="icon-button cutout-close" aria-label="取消上传"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="cutout-tabs" role="tablist" aria-label="图片版本"><button role="tab" data-mode="original">原图</button><button role="tab" data-mode="cutout">抠图</button></div><div class="cutout-preview"><canvas aria-label="衣服图片预览"></canvas><div class="cutout-progress" role="status"><span class="spinner"></span><span>正在抠图</span></div></div><div class="cutout-tools" aria-label="抠图修整" hidden><button data-tool="erase" aria-pressed="true">擦除</button><button data-tool="restore" aria-pressed="false">还原</button><input type="range" min="8" max="64" value="24" aria-label="笔刷大小"><button data-reset>重置</button></div><div class="cutout-feedback" hidden><p role="alert"></p><button data-retry>重试</button></div><button class="cutout-confirm">确认使用</button>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
  const progress = dialog.querySelector('.cutout-progress'), tools = dialog.querySelector('.cutout-tools');
  const feedback = dialog.querySelector('.cutout-feedback'), accept = dialog.querySelector('.cutout-confirm');
  const brush = dialog.querySelector('input');
  let pixels, initialPixels, originalPixels, controller, pending = false, error = '', settled = false, exporting = false;
  let mode = 'cutout', tool = 'erase', painting = false, previous, version = 0;
  const resize = (width, height) => { canvas.width = width; canvas.height = height; };
  function render() {
    if (settled) return;
    for (const button of dialog.querySelectorAll('[data-mode]')) button.setAttribute('aria-selected', String(button.dataset.mode === mode));
    for (const button of dialog.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    const showCutout = mode === 'cutout' && pixels;
    if (showCutout) { resize(pixels.width, pixels.height); context.putImageData(pixels, 0, 0); }
    else {
      const scale = Math.min(1, 1400 / Math.max(original.naturalWidth, original.naturalHeight));
      resize(Math.round(original.naturalWidth * scale), Math.round(original.naturalHeight * scale));
      context.drawImage(original, 0, 0, canvas.width, canvas.height);
    }
    canvas.classList.toggle('is-editable', Boolean(showCutout));
    progress.hidden = !(pending && mode === 'cutout');
    tools.hidden = !showCutout;
    feedback.hidden = !error;
    feedback.querySelector('p').textContent = error;
    accept.disabled = exporting || (mode === 'cutout' && (!pixels || pending));
  }
  async function processImage() {
    controller?.abort(); const activeController = new AbortController(); controller = activeController;
    const run = ++version; pending = true; error = ''; mode = 'cutout'; render();
    const timeout = setTimeout(() => activeController.abort(), 90000);
    let resultURL;
    try {
      const blob = await cutoutImage(file, { signal: activeController.signal });
      if (settled || run !== version) return;
      resultURL = makeURL(blob);
      const image = await loadImage(resultURL);
      if (settled || run !== version) return;
      resize(image.naturalWidth, image.naturalHeight);
      context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
      pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      initialPixels = new Uint8ClampedArray(pixels.data);
      context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(original, 0, 0, canvas.width, canvas.height);
      originalPixels = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch (reason) {
      if (!settled && run === version) error = reason.name === 'AbortError' ? '抠图超时，可使用原图或重试' : String(reason.message || '抠图失败，可使用原图').slice(0, 100);
    } finally {
      clearTimeout(timeout);
      if (resultURL) { URL.revokeObjectURL(resultURL); urls.delete(resultURL); }
      if (!settled && run === version) { pending = false; render(); }
    }
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height, radius: Number(brush.value) * canvas.width / rect.width / 2 };
  }
  function dab(x, y, radius) {
    const left = Math.max(0, Math.floor(x - radius)), right = Math.min(pixels.width - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius)), bottom = Math.min(pixels.height - 1, Math.ceil(y + radius));
    for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
      const distance = Math.hypot(px - x, py - y) / radius;
      if (distance > 1) continue;
      const amount = Math.min(1, (1 - distance) * 5), index = (py * pixels.width + px) * 4;
      if (tool === 'erase') pixels.data[index + 3] = Math.round(pixels.data[index + 3] * (1 - amount));
      else {
        for (let c = 0; c < 3; c++) pixels.data[index + c] = originalPixels.data[index + c];
        pixels.data[index + 3] = Math.round(pixels.data[index + 3] + (originalPixels.data[index + 3] - pixels.data[index + 3]) * amount);
      }
    }
  }
  canvas.onpointerdown = event => {
    if (mode !== 'cutout' || !pixels || pending || exporting) return;
    event.preventDefault(); painting = true; previous = point(event);
    canvas.setPointerCapture(event.pointerId); dab(previous.x, previous.y, previous.radius); context.putImageData(pixels, 0, 0);
  };
  canvas.onpointermove = event => {
    if (!painting || mode !== 'cutout' || !pixels) return;
    event.preventDefault(); const next = point(event);
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - previous.x, next.y - previous.y) / Math.max(1, next.radius * .3)));
    for (let i = 1; i <= steps; i++) dab(previous.x + (next.x - previous.x) * i / steps, previous.y + (next.y - previous.y) * i / steps, next.radius);
    previous = next; context.putImageData(pixels, 0, 0);
  };
  canvas.onpointerup = canvas.onpointercancel = event => { painting = false; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  for (const button of dialog.querySelectorAll('[data-mode]')) button.onclick = () => { painting = false; mode = button.dataset.mode; render(); };
  for (const button of dialog.querySelectorAll('[data-tool]')) button.onclick = () => { tool = button.dataset.tool; render(); };
  dialog.querySelector('[data-reset]').onclick = () => { pixels.data.set(initialPixels); render(); };
  dialog.querySelector('[data-retry]').onclick = () => void processImage();
  return new Promise(resolve => {
    function finish(result) {
      if (settled) return;
      settled = true; controller?.abort(); painting = false;
      dialog.close(); dialog.remove(); urls.forEach(url => URL.revokeObjectURL(url));
      resize(1, 1); pixels = initialPixels = originalPixels = undefined;
      resolve(result);
    }
    dialog.querySelector('.cutout-close').onclick = () => finish(null);
    dialog.addEventListener('close', () => finish(null));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finish(null);
    });
    accept.onclick = async () => {
      if (exporting) return;
      if (mode === 'original') { finish(file); return; }
      if (!pixels || pending) return;
      exporting = true; accept.disabled = true;
      try {
        let left = pixels.width, top = pixels.height, right = -1, bottom = -1;
        for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) if (pixels.data[(y * pixels.width + x) * 4 + 3] > 24) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
        if (right <= left || bottom <= top) throw new Error('请保留衣服区域，或切换原图');
        const foreground = document.createElement('canvas'); foreground.width = pixels.width; foreground.height = pixels.height;
        foreground.getContext('2d').putImageData(pixels, 0, 0);
        const output = document.createElement('canvas'); output.width = output.height = 1200;
        const out = output.getContext('2d'); out.fillStyle = '#ffffff'; out.fillRect(0, 0, 1200, 1200);
        const width = right - left + 1, height = bottom - top + 1, scale = 1056 / Math.max(width, height);
        out.drawImage(foreground, left, top, width, height, (1200 - width * scale) / 2, (1200 - height * scale) / 2, width * scale, height * scale);
        const blob = await toBlob(output);
        foreground.width = foreground.height = output.width = output.height = 1;
        finish(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-cutout.jpg', { type: 'image/jpeg' }));
      } catch (reason) { exporting = false; error = reason.message || '图片导出失败，请重试'; render(); }
    };
    dialog.showModal(); render(); void processImage();
  });
}
