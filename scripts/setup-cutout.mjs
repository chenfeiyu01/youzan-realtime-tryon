import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
const directory = new URL('../.local/models/', import.meta.url);
const destination = new URL('u2netp.onnx', directory);
const checksum = '8e83ca70e441ab06c318d82300c84806';
const hash = buffer => createHash('md5').update(buffer).digest('hex');
await mkdir(directory, { recursive: true });
try { if (hash(await readFile(destination)) === checksum) { console.log('抠图模型已准备好'); process.exit(0); } } catch {}
console.log('正在下载本地抠图模型');
const response = await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', { signal: AbortSignal.timeout(180000) });
if (!response.ok) throw new Error('抠图模型下载失败，请重试');
const bytes = Buffer.from(await response.arrayBuffer());
if (hash(bytes) !== checksum) throw new Error('抠图模型校验未通过，请重新下载');
const temporary = new URL('u2netp.onnx.download', directory);
await writeFile(temporary, bytes);
await rename(temporary, destination);
console.log('抠图模型已准备好');
