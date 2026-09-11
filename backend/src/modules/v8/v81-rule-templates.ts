import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { approvedRuleTemplate } from './domain/rule-template.js';

export class RuleTemplateInput {
  @IsString() @MaxLength(100) @Matches(/\S/u) displayName!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
export class RuleTemplateQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_o, v: unknown) => v !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) beforeVersion?: number;
}
type Template = { id: string; version: number; display_name: string; rules: unknown; published_at: Date };
const project = (t: Template) => ({ id: t.id, version: t.version, displayName: t.display_name, rules: t.rules, publishedAt: t.published_at.toISOString() });
@Injectable()
export class V81RuleTemplatesService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}
  private async readAccess(principal: AuthenticatedPrincipal) {
    if (principal.role === 'ADMIN') await requireAdminAccess(this.prisma, principal, 'SUPER');
    else if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }
  async list(principal: AuthenticatedPrincipal, query: RuleTemplateQuery) {
    await this.readAccess(principal);
    const rows = await this.prisma.$queryRaw<Template[]>`SELECT * FROM v81_rule_templates WHERE organization_id=${principal.organizationId}::uuid
      AND (${query.beforeVersion ?? null}::integer IS NULL OR version<${query.beforeVersion ?? null}::integer)
      ORDER BY version DESC LIMIT ${query.limit + 1}`;
    const page = rows.slice(0, query.limit);
    return { items: page.map(project), nextBeforeVersion: rows.length > query.limit ? page.at(-1)!.version : null };
  }
  async get(principal: AuthenticatedPrincipal, id: string) {
    await this.readAccess(principal);
    const rows = await this.prisma.$queryRaw<Template[]>`SELECT * FROM v81_rule_templates WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
    if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return project(rows[0]);
  }
  async publish(principal: AuthenticatedPrincipal, input: RuleTemplateInput, requestId: string, key?: string) {
    await requireAdminAccess(this.prisma, principal, 'SUPER');
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'publishV81RuleTemplate', scope: principal.organizationId,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'SUPER');
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const versions = await tx.$queryRaw<{ version: number }[]>`SELECT coalesce(max(version),0)::integer AS version FROM v81_rule_templates WHERE organization_id=${principal.organizationId}::uuid`;
      const version = versions[0]!.version;
      if (input.expectedVersion !== version) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const id = this.ids.next(), now = this.clock.now(), name = input.displayName.trim();
      await tx.$executeRaw`INSERT INTO v81_rule_templates(id,organization_id,version,display_name,rules,actor_id,request_id,published_at)
        VALUES(${id}::uuid,${principal.organizationId}::uuid,${version + 1},${name},${JSON.stringify(approvedRuleTemplate)}::jsonb,${principal.userId}::uuid,${requestId},${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'RULE_TEMPLATE',${id}::uuid,'PUBLISHED',${principal.userId}::uuid,${requestId},${version + 1},
          ${JSON.stringify({ displayName: name, rules: approvedRuleTemplate })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(project({ id, version: version + 1, display_name: name, rules: approvedRuleTemplate, published_at: now }));
    });
  }
}
@Controller('rule-templates')
export class V81RuleTemplatesController {
  constructor(private readonly service: V81RuleTemplatesService) {}
  @Get() @OperationPolicy('listV81RuleTemplates')
  list(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: RuleTemplateQuery) { return this.service.list(p, q); }
  @Get(':id') @OperationPolicy('getV81RuleTemplate')
  get(@CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) { return this.service.get(p, id); }
  @Post() @OperationPolicy('publishV81RuleTemplate')
  publish(@CurrentPrincipal() p: AuthenticatedPrincipal, @Body() input: RuleTemplateInput, @Req() req: FoundationRequest,
    @Headers('idempotency-key') key?: string) { return this.service.publish(p, input, req.requestId, key); }
}
