import { apiRequest } from './runtime.js';
let xmaxModule, decartModule;
export const preloadProvider = provider => provider === 'xmax'
  ? (xmaxModule ||= import('@xmaxai/web-sdk'))
  : (decartModule ||= import('@decartai/sdk'));
const referenceBlobs = new Map();
async function referenceBlob(item) {
  if (item.file) return item.file;
  if (!referenceBlobs.has(item.id)) referenceBlobs.set(item.id, fetch(item.image).then(response => {
    if (!response.ok) throw new Error('服饰参考图未能加载');
    return response.blob();
  }).catch(error => { referenceBlobs.delete(item.id); throw error; }));
  return referenceBlobs.get(item.id);
}
const promptFor = item => {
  const target = { tops: 'top', bottoms: 'bottoms', outfits: 'outfit', shoes: 'shoes' }[item.category] || 'outfit';
  return `Substitute the person's current ${target} with the exact ${target} in the reference image. Preserve garment color, texture, pattern and fit; preserve the person's identity, pose, remaining clothing and background.`;
};
export function createProviderSession({ model, stream, format, output, mirrored, onLive, onError }) {
  let closed = false, issued, manager, view, client, rt, remoteVideo, connecting;
  let input = stream.clone();
  const uploaded = new Map();
  const current = () => { if (closed) throw new DOMException('已停止', 'AbortError'); };
  const referenceFor = async item => {
    if (item.remote) return item.remote;
    if (!uploaded.has(item.id)) {
      const data = await referenceBlob(item); current();
      const result = await client.createStorageService().uploadImage({ data, fileName: item.file?.name || `${item.id}.jpg`, contentType: data.type || 'image/jpeg' });
      uploaded.set(item.id, result.url);
    }
    return uploaded.get(item.id);
  };
  const disposeIssued = async () => {
    const old = issued; issued = undefined;
    if (old) await apiRequest(`/api/session/${old.id}`, { method: 'DELETE', keepalive: true });
  };
  return {
    async start(item) {
      const sdk = await preloadProvider(model.provider); current();
      issued = await apiRequest('/api/session', { method: 'POST', body: JSON.stringify({ modelId: model.id }) });
      if (closed) { await disposeIssued(); current(); }
      if (model.provider === 'xmax') {
        client = new sdk.XmaxClient(new sdk.XmaxConfiguration({ apiKey: issued.temporaryApiKey, environment: sdk.XmaxEnvironment.china, loggerOptions: sdk.XmaxLoggerOption.none }));
        manager = client.createRealtimeManager(new sdk.RealtimeConfiguration({ model: model.remote }));
        await manager.setStateListener(state => {
          if (closed) return;
          if (state.reason?.kind === 'failure') onError(state.reason.error);
          else if (state.connectionState === sdk.RealtimeConnectionState.generating) onLive();
        });
        const referencePath = await referenceFor(item); current();
        const local = await manager.createExternalVideoStream({ videoTrack: input.getVideoTracks()[0], videoFormat: new sdk.RealtimeVideoFormat({ ...format, minimumBitrate: 300, maximumBitrate: 1600 }) });
        current();
        view = new sdk.XmaxRealtimeVideoView({ videoContentMode: sdk.VideoContentMode.fit, isInteractionEnabled: false, fadeInDurationMs: 0 });
        view.isMirrored = mirrored; view.element.style.cssText = 'width:100%;height:100%;background:transparent'; view.attach(output);
        const result = await manager.startGeneration({ localStream: local, context: new sdk.RealtimeContext({ prompt: item.prompt, referencePath }), faceRestoration: true });
        current(); view.track = result.videoTrack;
        this.update = async next => {
          const ref = await referenceFor(next); current();
          const result = await manager.startGeneration({ localStream: local, context: new sdk.RealtimeContext({ prompt: next.prompt, referencePath: ref }), faceRestoration: true });
          current(); view.track = result.videoTrack;
        };
      } else {
        const initialImage = await referenceBlob(item); current();
        const sessionId = issued.id;
        let token = { apiKey: issued.temporaryApiKey, expiresAt: issued.expiresAt };
        client = sdk.createDecartClient({ apiKeyProvider: async () => {
          current();
          if (token.expiresAt < Date.now() + 30000) token = await apiRequest(`/api/session/${sessionId}/token`, { method: 'POST', body: '{}' });
          current(); return token.apiKey;
        }, logger: sdk.noopLogger, telemetry: false });
        remoteVideo = document.createElement('video');
        remoteVideo.autoplay = true; remoteVideo.muted = true; remoteVideo.playsInline = true;
        remoteVideo.className = `remote-video${mirrored ? ' mirrored' : ''}`;
        remoteVideo.setAttribute('aria-label', model.label + '实时换装画面');
        remoteVideo.onloadeddata = () => { if (!closed) onLive(); };
        output.replaceChildren(remoteVideo);
        connecting = client.realtime.connect(input, {
          model: sdk.models.realtime(model.remote), mirror: false, retries: 0,
          initialState: { image: initialImage, prompt: { text: promptFor(item), enhance: false } },
          onRemoteStream: remote => {
            if (closed) return;
            remoteVideo.srcObject = remote;
            void remoteVideo.play().catch(onError);
          },
        });
        rt = await connecting;
        if (closed) { rt.disconnect(); current(); }
        rt.on('error', error => { if (!closed) onError(error); });
        rt.on('sessionEnded', event => { if (!closed) onError(new Error(event.reason === 'insufficient_credits' ? 'Decart 账户余额不足' : `Decart 会话已结束：${event.reason}`)); });
        this.update = async next => { const image = await referenceBlob(next); current(); await rt.setImage(image, { prompt: promptFor(next), enhance: false }); current(); };
      }
    },
    async update() {},
    async close() {
      if (closed) return;
      closed = true;
      rt?.disconnect();
      if (remoteVideo) { remoteVideo.onloadeddata = null; remoteVideo.pause(); remoteVideo.srcObject = null; }
      view?.detach();
      input.getTracks().forEach(track => track.stop());
      const closing = manager?.close() || (!rt && connecting ? connecting.then(connection => connection.disconnect(), () => {}) : undefined);
      let timeout;
      try {
        if (closing) await Promise.race([closing, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('视频连接关闭未确认，请刷新页面')), 5000); })]);
      } finally { clearTimeout(timeout); await disposeIssued(); }
    },
  };
}
