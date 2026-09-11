import net from 'node:net';
import tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { loadTencentDbCa } from './postgres-tls.mjs';

const host = '172.19.0.16';
const ca = loadTencentDbCa('/run/secrets/tencentdb-ca-chain.pem');
const output = [];
function record(check, status, details = {}) { output.push({ check, status, ...details }); }
async function pgTls(expectedName) {
  return await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 5432 });
    socket.setTimeout(10000, () => socket.destroy(new Error('TIMEOUT')));
    socket.once('error', reject);
    socket.once('connect', () => {
      const request = Buffer.alloc(8);
      request.writeInt32BE(8, 0);
      request.writeInt32BE(80877103, 4);
      socket.write(request);
    });
    socket.once('data', (data) => {
      if (data.toString() !== 'S') { socket.destroy(); reject(new Error('SSL_UNAVAILABLE')); return; }
      const secure = tls.connect({ socket, ca, rejectUnauthorized: true,
        checkServerIdentity: (_, cert) => tls.checkServerIdentity(expectedName, cert) });
      secure.once('secureConnect', () => { const protocol = secure.getProtocol(); secure.end(); resolve(protocol); });
      secure.once('error', reject);
    });
  });
}
try {
  record('backend_ca_loader', 'PASS');
  record('container_pg_strict_tls', 'PASS', { protocol: await pgTls(host) });
  try { await pgTls('wrong-host.invalid'); record('wrong_hostname_denied', 'FAIL'); }
  catch (error) { record('wrong_hostname_denied', error.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ? 'PASS' : 'FAIL', { code: error.code }); }
  const base = 'http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/';
  const role = (await (await fetch(base, { signal: AbortSignal.timeout(5000) })).text()).trim();
  if (role !== 'BNBUSportsHKCVMRole') throw new Error('ROLE_MISMATCH');
  const credentials = await (await fetch(base + role, { signal: AbortSignal.timeout(5000) })).json();
  record('container_temporary_credentials', ['TmpSecretId', 'TmpSecretKey', 'Token'].every(k => credentials[k]) ? 'PASS' : 'FAIL');
  const bucket = 'bnbu-sports-prod-hk-1443273655.cos.ap-hongkong.myqcloud.com';
  record('container_cos_dns', 'PASS', { address: (await lookup(bucket)).address });
  const response = await fetch('https://' + bucket + '/', { signal: AbortSignal.timeout(10000) });
  record('container_cos_https_private', response.status === 403 ? 'PASS' : 'FAIL', { http: response.status });
} catch (error) { record('execution', 'FAIL', { code: error.code ?? error.name }); }
console.log(JSON.stringify({ utc: new Date().toISOString(), uid: process.getuid(), checks: output }, null, 2));
process.exitCode = output.some(row => row.status !== 'PASS') ? 1 : 0;
