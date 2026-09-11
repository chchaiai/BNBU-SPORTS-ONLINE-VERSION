import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { Readable } from 'node:stream';
import { it } from 'node:test';
import { scannedMediaStream } from '../../src/modules/media/application/clamav-stream.js';

for (const reply of ['stream: OK\0', 'stream: Eicar FOUND\0', 'stream: limit ERROR\0', 'unexpected\0']) {
  it(`scanner requires an explicit clean verdict: ${JSON.stringify(reply)}`, async () => {
    const received: Buffer[] = [];
    const server = createServer(socket => {
      let data = Buffer.alloc(0);
      socket.on('data', chunk => {
        data = Buffer.concat([data, chunk]);
        if (data.length >= 10 && data.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) data = data.subarray(10);
        while (data.length >= 4) {
          const size = data.readUInt32BE();
          if (data.length < size + 4) return;
          if (size === 0) { socket.end(reply); return; }
          received.push(data.subarray(4, size + 4));
          data = data.subarray(size + 4);
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    try {
      const read = async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of scannedMediaStream(Readable.from([Buffer.from('one'), Buffer.from('two')]), '127.0.0.1', address.port)) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks).toString();
      };
      if (reply === 'stream: OK\0') assert.equal(await read(), 'onetwo');
      else await assert.rejects(read, (error: { code?: string }) => error.code === (reply.includes('FOUND') ? 'MEDIA_INTEGRITY_MISMATCH' : 'SYSTEM_SERVICE_UNAVAILABLE'));
      assert.equal(Buffer.concat(received).toString(), 'onetwo');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}

it('scanner timeout fails closed', async () => {
  const server = createServer(socket => socket.resume());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(async () => {
      for await (const _ of scannedMediaStream(Readable.from([Buffer.from('probe')]), '127.0.0.1', (server.address() as { port: number }).port, 40)) { /* consume */ }
    }, (error: { code?: string }) => error.code === 'SYSTEM_SERVICE_UNAVAILABLE');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
