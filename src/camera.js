export function wantsPortraitCamera() {
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  return touch && matchMedia('(orientation: portrait)').matches;
}

export async function createCameraSource(facingMode) {
  const portrait = wantsPortraitCamera();
  const width = portrait ? 720 : 1280;
  const height = portrait ? 1280 : 720;
  const supported = navigator.mediaDevices.getSupportedConstraints();
  const constraints = {
    facingMode: { ideal: facingMode },
    width: { ideal: width }, height: { ideal: height },
    aspectRatio: { ideal: width / height }, frameRate: { ideal: 20, max: 24 },
    ...(supported.resizeMode ? { resizeMode: 'crop-and-scale' } : {}),
  };
  let raw;
  let output;
  let source;
  let canvas;
  let callback;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (callback !== undefined) cancelAnimationFrame(callback);
    output?.getTracks().forEach(track => track.stop());
    raw?.getTracks().forEach(track => track.stop());
    if (source) { source.pause(); source.srcObject = null; }
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  };
  try {
    raw = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
    source = document.createElement('video');
    source.muted = true; source.autoplay = true; source.playsInline = true;
    source.setAttribute('playsinline', '');
    source.srcObject = raw;
    await source.play();
    if (!source.videoWidth || !source.videoHeight) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { cleanup(); reject(new Error('摄像头启动超时')); }, 8000);
        const loaded = () => { cleanup(); resolve(); };
        const cleanup = () => { clearTimeout(timeout); source.removeEventListener('loadeddata', loaded); };
        source.addEventListener('loadeddata', loaded, { once: true });
      });
    }
    if (portrait) {
      canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (context && typeof canvas.captureStream === 'function') {
        let lastDraw = -Infinity;
        const draw = (time) => {
          if (closed) return;
          if (time - lastDraw >= 48 && source.videoWidth && source.videoHeight) {
            const sw = source.videoWidth, sh = source.videoHeight;
            const scale = Math.max(width / sw, height / sh);
            const cropWidth = width / scale, cropHeight = height / scale;
            context.drawImage(source, (sw - cropWidth) / 2, (sh - cropHeight) / 2,
              cropWidth, cropHeight, 0, 0, width, height);
            lastDraw = time;
          }
          callback = requestAnimationFrame(draw);
        };
        draw(performance.now());
        output = canvas.captureStream(20);
      } else {
        if (source.videoWidth >= source.videoHeight) throw new Error('此浏览器未提供竖屏视频，请使用最新版 Safari 或 Chrome');
        output = raw;
      }
    } else { output = raw; }
    const format = portrait && output !== raw
      ? { width, height, fps: 20 }
      : { width: source.videoWidth, height: source.videoHeight, fps: Math.min(raw.getVideoTracks()[0].getSettings().frameRate || 20, 24) };
    return { stream: output, format, portrait, close };
  } catch (error) { close(); throw error; }
}
