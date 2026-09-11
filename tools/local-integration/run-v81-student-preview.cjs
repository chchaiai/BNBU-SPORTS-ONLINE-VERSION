// Dedicated local student integration preview; public config exposes only APP_ENV.
process.env.APP_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '4274';
process.env.API_HOST = '127.0.0.1';
process.env.API_PORT = '3199';
process.env.MINIO_HOST = '127.0.0.1';
process.env.MINIO_PORT = '19000';
process.env.MINIO_PUBLIC_AUTHORITY = '127.0.0.1:19000';
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, [require.resolve('../../BNBU-Sports-Web-new/frontend/preview-server.cjs')], { env: process.env, stdio: 'inherit', windowsHide: true });
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
