import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** Dedicated bounded HTTP diagnostic files, never request bodies or headers. */
export class RuntimeLogWriter {
  constructor(
    private readonly directory: string,
    private readonly maximumBytes = 8 * 1024 * 1024,
  ) {
    if (!isAbsolute(directory)) throw new Error('RUNTIME_LOG_DIRECTORY_INVALID');
    mkdirSync(directory, { recursive: true, mode: 0o750 });
  }

  append(record: object): void {
    const current = join(this.directory, 'http-current.ndjson');
    const line = JSON.stringify(record) + '\n';
    if (
      existsSync(current) &&
      statSync(current).size + Buffer.byteLength(line) > this.maximumBytes
    ) {
      const oldest = join(this.directory, 'http-5.ndjson');
      if (existsSync(oldest)) unlinkSync(oldest);
      for (let i = 4; i >= 1; i--) {
        const source = join(this.directory, `http-${i}.ndjson`);
        if (existsSync(source)) renameSync(source, join(this.directory, `http-${i + 1}.ndjson`));
      }
      renameSync(current, join(this.directory, 'http-1.ndjson'));
    }
    appendFileSync(current, line, { mode: 0o640 });
  }
}
