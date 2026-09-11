// Run inside the prepared Backend image on the CVM. Synthetic data only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TencentOcrProvider } from '/app/dist/modules/v8/tencent-ocr-provider.js';

const bytes = await readFile('/app/ocr-synthetic-roster.png');
const digest = createHash('sha256').update(bytes).digest('hex');
const provider = new TencentOcrProvider({ provider: 'TENCENT_TABLE_V3', region: 'ap-guangzhou', timeoutMs: 20000 });
try {
  const result = await provider.recognize(bytes, 'image/png', digest);
  assert.equal(result.requiresTeacherConfirmation, true);
  assert.ok(result.tables.flatMap(t => t.cells).some(c => c.text.includes('9900000001')));
  console.log(JSON.stringify({ check: 'real-CVM-role-Tencent-table-V3-provider', status: 'PASS', at: new Date().toISOString(), requestId: result.requestId, sourceSha256: digest, tableCount: result.tables.length, cellCount: result.tables.reduce((n,t) => n+t.cells.length,0), requiresTeacherConfirmation: result.requiresTeacherConfirmation }));
} catch (error) {
  console.log(JSON.stringify({check:'real-CVM-role-Tencent-table-V3-provider',status:'FAIL',at:new Date().toISOString(),code: /^OCR_[A-Z_]+$/.test(error.message) ? error.message : 'ASSERTION_FAILED'}));
  process.exitCode=1;
}
