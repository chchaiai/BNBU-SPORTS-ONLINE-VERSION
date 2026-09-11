import { Readable } from 'node:stream';
import { scannedMediaStream } from '/app/dist/modules/media/application/clamav-stream.js';

const results = [];
const probe = async (bytes, endpoint) => {
  for await (const chunk of scannedMediaStream(Readable.from([bytes]), endpoint)) { /* consume */ }
};
await probe(Buffer.from('BNBU synthetic production scanner probe'), '/run/clamav/clamd.ctl');
results.push({check: 'clean-stream', status: 'PASS'});
const eicar = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64');
try {
  await probe(eicar, '/run/clamav/clamd.ctl');
  throw new Error('Scanner accepted EICAR');
} catch (error) {
  if (error.code !== 'MEDIA_INTEGRITY_MISMATCH') throw error;
  results.push({check: 'real-EICAR-rejected', status: 'PASS'});
}
try {
  await probe(Buffer.from('probe'), '/run/clamav/nonexistent.sock');
  throw new Error('Scanner accepted unavailable endpoint');
} catch (error) {
  if (error.code !== 'SYSTEM_SERVICE_UNAVAILABLE') throw error;
  results.push({check: 'unavailable-fails-closed', status: 'PASS'});
}
console.log(JSON.stringify(results));
