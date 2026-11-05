import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
const root = fileURLToPath(new URL('..', import.meta.url));
const binary = process.env.CLOUDFLARED_PATH || (existsSync(path.join(root, '.local/cloudflared')) ? path.join(root, '.local/cloudflared') : 'cloudflared');
const port = Number(process.env.BROKER_PORT || 5174);
let server;
try { await fetch(`http://127.0.0.1:${port}/api/config`, { signal: AbortSignal.timeout(1500) }); }
catch {
  server = spawn(process.execPath, ['server.mjs'], { cwd: root, stdio: 'inherit' });
  await new Promise(resolve => setTimeout(resolve, 1800));
}
const tunnel = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--no-autoupdate'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let announced = false;
function output(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !announced) {
    announced = true;
    const url = match[0];
    writeFileSync(path.join(root, '.local/bridge-public.json'), JSON.stringify({ url }), { mode: 0o600 });
    const { grant } = JSON.parse(readFileSync(path.join(root, '.local/bridge-access.json'), 'utf8'));
    const link = new URL('https://chenfeiyu01.github.io/youzan-realtime-tryon/');
    link.search = new URLSearchParams({ v: 'compare9', bridge: url, grant }).toString();
    writeFileSync(path.join(root, '.local/bridge-link.json'), JSON.stringify({ url: link.href }), { mode: 0o600 });
    void QRCode.toFile(path.join(root, '../手机体验二维码.png'), link.href, { margin: 2, width: 640 });
    console.log('手机公网授权入口已生成。电脑应用和此窗口需保持运行。');
    console.log(link.href);
  }
  if (/ERR|WRN/.test(text)) process.stderr.write(text);
}
tunnel.stdout.on('data', output); tunnel.stderr.on('data', output);
tunnel.on('error', () => { console.error('未找到 cloudflared，请安装官方 Cloudflare Tunnel 客户端后重试。'); server?.kill('SIGTERM'); process.exitCode = 1; });
tunnel.on('exit', code => { server?.kill('SIGTERM'); process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { tunnel.kill('SIGTERM'); server?.kill('SIGTERM'); });
