import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { V81Service } from './v81.service.js';

@Injectable()
export class V81DeadlineWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private cursor: string | null = null;
  private readonly logger = new Logger(V81DeadlineWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: V81Service,
  ) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.prisma.$queryRaw<
        { record_id: string; organization_id: string }[]
      >`
        SELECT record_id,organization_id FROM v81_record_workflows WHERE stage='AWAITING_SUPPLEMENT'
        AND supplement_accepted_at IS NULL AND (${this.cursor}::uuid IS NULL OR record_id>${this.cursor}::uuid)
        ORDER BY record_id LIMIT 100`;
      for (const item of candidates)
        await this.records.expireSupplement(item.organization_id, item.record_id);
      this.cursor = candidates.at(-1)?.record_id ?? null;
    } catch {
      this.logger.error('Supplement deadline scan failed; records remain pending for retry.');
    } finally {
      this.running = false;
    }
  }
}
