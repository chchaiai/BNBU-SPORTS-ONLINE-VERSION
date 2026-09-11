import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';

const options = new Set(process.argv.slice(2));
const allowed = new Set(['--require-backend', '--require-web', '--configure-adb']);
for (const option of options) {
  if (!allowed.has(option)) {
    console.error(`LOCAL_RUNTIME_CHECK=INVALID_ARGUMENT argument=${option}`);
    process.exit(2);
  }
}

const failures = [];

async function tcp(name, port) {
  await new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (error, timedOut = false) => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      // A failed connect is already closing its libuv handle on Windows. Calling
      // destroy() again from the error callback can trip UV_HANDLE_CLOSING in
      // Node 24. Only a timeout needs forced teardown; a successful probe ends
      // normally and an errored probe is left to its existing close path.
      if (timedOut && !socket.destroyed) socket.destroy();
      else if (!error && !socket.destroyed) socket.end();
      if (error) failures.push(`${name}:tcp-unavailable`);
      resolve();
    };
    socket.setTimeout(2_000, () => finish(true, true));
    socket.once('connect', () => finish(false));
    socket.once('error', () => finish(true));
  });
}

async function http(name, url, validate = () => true) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok || !(await validate(response))) failures.push(`${name}:http-unhealthy`);
  } catch {
    failures.push(`${name}:http-unavailable`);
  }
}

await Promise.all([
  tcp('postgres', 5433),
  tcp('minio', 9000),
  tcp('mailpit-smtp', 1025),
  http('minio', 'http://127.0.0.1:9000/minio/health/live'),
]);

if (options.has('--require-backend')) {
  const health = async (response) => {
    const body = await response.json();
    return body?.data?.status === 'UP';
  };
  await http('backend-live', 'http://127.0.0.1:3000/api/v1/health/live', health);
  await http('backend-ready', 'http://127.0.0.1:3000/api/v1/health/ready', health);
}

if (options.has('--require-web')) {
  await http('web', 'http://127.0.0.1:3001/');
}

if (options.has('--configure-adb')) {
  const state = spawnSync('adb', ['get-state'], { encoding: 'utf8', windowsHide: true });
  if (state.status !== 0 || state.stdout.trim() !== 'device') {
    failures.push('adb:no-single-ready-device');
  } else {
    const reverse = spawnSync('adb', ['reverse', 'tcp:9000', 'tcp:9000'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const list = spawnSync('adb', ['reverse', '--list'], { encoding: 'utf8', windowsHide: true });
    if (reverse.status !== 0 || list.status !== 0 || !list.stdout.includes('tcp:9000 tcp:9000')) {
      failures.push('adb:minio-reverse-missing');
    }
  }
}

if (failures.length > 0) {
  console.error(`LOCAL_RUNTIME_CHECK=FAIL count=${failures.length}`);
  for (const failure of failures) console.error(failure);
  // Let undici/net close their Windows libuv handles before termination.
  // Immediate process.exit() can race that cleanup and abort Node 24.
  process.exitCode = 1;
} else {
  console.log('LOCAL_RUNTIME_CHECK=PASS');
  console.log(
    `infra=healthy backend=${options.has('--require-backend') ? 'healthy' : 'not-required'} web=${options.has('--require-web') ? 'healthy' : 'not-required'} adb=${options.has('--configure-adb') ? 'configured' : 'not-requested'} host=127.0.0.1 secrets=redacted`,
  );
}
