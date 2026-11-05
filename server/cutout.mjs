import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const modelPath = fileURLToPath(new URL('../.local/models/u2netp.onnx', import.meta.url));
let runtime, sharp, sessionPromise;
export const cutoutAvailable = () => existsSync(modelPath);
async function getSession() {
  if (!cutoutAvailable()) throw new Error('抠图服务尚未准备好，请先使用原图');
  if (!sessionPromise) sessionPromise = (async () => {
    runtime = await import('onnxruntime-node');
    sharp = (await import('sharp')).default;
    return runtime.InferenceSession.create(modelPath, { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'all' });
  })().catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}
export async function removeGarmentBackground(buffer) {
  const session = await getSession();
  const { data: rgba, info } = await sharp(buffer, { limitInputPixels: 80000000, failOn: 'error' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width < 16 || info.height < 16) throw new Error('图片尺寸太小，请换一张清晰图片');
  const rgb = await sharp(rgba, { raw: info }).removeAlpha().resize(320, 320, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  let max = 1;
  for (const value of rgb) if (value > max) max = value;
  const size = 320 * 320, tensor = new Float32Array(size * 3);
  const mean = [.485, .456, .406], std = [.229, .224, .225];
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) tensor[c * size + i] = (rgb[i * 3 + c] / max - mean[c]) / std[c];
  const result = await session.run({ [session.inputNames[0]]: new runtime.Tensor('float32', tensor, [1, 3, 320, 320]) });
  const prediction = result[session.outputNames[0]].data;
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < size; i++) { low = Math.min(low, prediction[i]); high = Math.max(high, prediction[i]); }
  if (!Number.isFinite(low) || high - low < 1e-7) throw new Error('未识别到清晰主体，请使用原图');
  const alpha = Buffer.alloc(size);
  for (let i = 0; i < size; i++) alpha[i] = Math.round((prediction[i] - low) / (high - low) * 255);
  const enlarged = await sharp(alpha, { raw: { width: 320, height: 320, channels: 1 } }).resize(info.width, info.height, { kernel: 'lanczos3' }).toColourspace('b-w').raw().toBuffer();
  let foreground = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * enlarged[i] / 255);
    if (rgba[i * 4 + 3] > 128) foreground++;
  }
  if (foreground < info.width * info.height * .002) throw new Error('未识别到清晰主体，请使用原图');
  return sharp(rgba, { raw: info }).png().toBuffer();
}
