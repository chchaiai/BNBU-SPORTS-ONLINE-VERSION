import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeLogWriter } from '../../src/common/logging/runtime-log-writer.js';

test('runtime log rotation preserves complete JSON lines and bounds the dedicated files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bnbu-runtime-writer-'));
  try {
    const writer = new RuntimeLogWriter(directory, 90);
    for (let i = 0; i < 20; i++) writer.append({ requestId: `synthetic-${i}`, statusCode: 200 });
    const files = readdirSync(directory);
    assert.ok(files.length <= 6);
    const records = files.flatMap((file) => {
      const text = readFileSync(join(directory, file), 'utf8');
      assert.ok(text.endsWith('\n'));
      return text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as {requestId: string; statusCode: number});
    });
    assert.ok(records.some((row) => row.requestId === 'synthetic-19'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
