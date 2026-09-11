import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';

@Injectable()
export class V81StudentMediaErasureWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly logger = new Logger(V81StudentMediaErasureWorker.name);
  constructor(private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort) {}
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async processOne(): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      const [item] = await tx.$queryRaw<{ id: string; storage_key: string }[]>`
        SELECT id,storage_key FROM v81_student_media_erasure WHERE deleted_at IS NULL AND next_attempt_at<=clock_timestamp()
        ORDER BY attempts,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!item) return false;
      try {
        await this.storage.deletePrivateObject(item.storage_key);
        // Delete immediately, then repeat after all old upload capabilities have expired.
        await tx.$executeRaw`UPDATE v81_student_media_erasure SET
          deleted_at=CASE WHEN finalize_after<=clock_timestamp() THEN clock_timestamp() ELSE NULL END,
          next_attempt_at=greatest(finalize_after,clock_timestamp()),attempts=attempts+1 WHERE id=${item.id}::uuid`;
      } catch {
        await tx.$executeRaw`UPDATE v81_student_media_erasure SET attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '30 seconds' WHERE id=${item.id}::uuid`;
        this.logger.error('Student media erasure will retry.');
      }
      return true;
    }, { timeout: 30000 });
  }
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { for (let i = 0; i < 10 && await this.processOne(); i++) { /* bounded durable cleanup */ } }
    catch { this.logger.error('Student media erasure scan will retry.'); }
    finally { this.running = false; }
  }
}
