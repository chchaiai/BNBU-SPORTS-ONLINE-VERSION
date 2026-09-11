import { createConnection } from 'node:net';
import { Readable } from 'node:stream';
import { ApplicationError } from '../../../common/errors/application-error.js';

const unavailable = () => new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, { dependency: 'MEDIA_SCANNER' });

/** Stream to a private clamd INSTREAM endpoint; only an explicit clean verdict succeeds. */
export function scannedMediaStream(source: Readable, host: string | undefined, port = 3310, timeoutMs = 120_000): Readable {
  return Readable.from((async function* () {
    if (!host) throw unavailable();
    const socket = createConnection(host.startsWith('/') ? { path: host } : { host, port });
    let reply = '';
    let settle: (error?: Error) => void = () => {};
    const verdict = new Promise<void>((resolve, reject) => {
      settle = (error) => error ? reject(error) : resolve();
    });
    // A scanner can fail while the source is still being read.
    void verdict.catch(() => {});
    const timer = setTimeout(() => socket.destroy(unavailable()), timeoutMs);
    socket.on('error', () => settle(unavailable()));
    socket.on('close', () => { if (!reply.includes('\0')) settle(unavailable()); });
    socket.on('data', (data: Buffer) => {
      reply += data.toString('utf8');
      if (reply.length > 4096) socket.destroy(unavailable());
      else if (reply.includes('\0')) {
        if (reply === 'stream: OK\0') settle();
        else if (/^stream: [^\0\r\n]+ FOUND\0$/.test(reply)) settle(new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422));
        else settle(unavailable());
      }
    });
    const write = (data: Buffer) => new Promise<void>((resolve, reject) => {
      socket.write(data, (error) => error ? reject(unavailable()) : resolve());
    });
    try {
      await write(Buffer.from('zINSTREAM\0'));
      for await (const chunk of source) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        await write(length);
        await write(data);
        yield data;
      }
      await write(Buffer.alloc(4));
      await verdict;
    } finally {
      clearTimeout(timer);
      socket.destroy();
      source.destroy();
    }
  })());
}
