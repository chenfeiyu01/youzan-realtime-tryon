import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function prepareCertificates(root) {
  const dir = path.join(root, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const run = (args) => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
  if (!existsSync(path.join(dir, 'ca.key')) || !existsSync(path.join(dir, 'ca.crt'))) {
    writeFileSync(path.join(dir, 'ca.conf'), '[req]\ndistinguished_name=dn\nx509_extensions=v3_ca\nprompt=no\n[dn]\nCN=Youzan Local Try-On CA\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n');
    run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-sha256',
      '-keyout', 'ca.key', '-out', 'ca.crt', '-config', 'ca.conf']);
  }
  const ips = [...new Set(['127.0.0.1', ...Object.values(networkInterfaces()).flat()
    .filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address)])];
  const names = ['localhost', hostname().replace(/[^a-zA-Z0-9.-]/g, '')].filter(Boolean);
  writeFileSync(path.join(dir, 'server.ext'), [
    'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=${[...names.map(x => `DNS:${x}`), ...ips.map(x => `IP:${x}`)].join(',')}`,
  ].join('\n'));
  run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost']);
  run(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial',
    '-out', 'server.crt', '-days', '29', '-sha256', '-extfile', 'server.ext']);
  run(['x509', '-in', 'ca.crt', '-outform', 'der', '-out', 'phone-ca.cer']);
  copyFileSync(path.join(dir, 'phone-ca.cer'), path.join(root, '有赞实时换装-手机证书.cer'));
  for (const name of ['ca.key', 'server.key']) chmodSync(path.join(dir, name), 0o600);
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareCertificates(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
  console.log('已准备本地 HTTPS 证书；未连接 Xmax。');
}
