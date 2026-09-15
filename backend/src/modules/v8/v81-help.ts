import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsNumber, IsString, Min, Max, MaxLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '../../generated/prisma/client.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { FoundationRequest } from '../../common/http/request-context.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { normalizeHelpContent, type HelpContentInput, type HelpStatus } from './domain/help-article.js';

export const HELP_CATEGORIES = ['login','enrollment','checkin','evidence','course','exemption','organization','notification','maintenance','feedback'] as const;
export class HelpListQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(200) search?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsIn(['draft','published','archived']) status?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['login','enrollment','checkin','evidence','course','exemption','organization','notification','maintenance','feedback']) category?: string;
}
export class StudentHelpQuery {
  @IsIn(['zh-CN', 'en']) locale = 'zh-CN';
}
export class SaveHelpInput implements HelpContentInput {
  @IsString() titleZh!: string;
  @IsString() titleEn!: string;
  @IsString() bodyZh!: string;
  @IsString() bodyEn!: string;
  @IsArray() @IsString({ each: true }) keywords!: string[];
  @IsIn(['login','enrollment','checkin','evidence','course','exemption','organization','notification','maintenance','feedback']) category!: string;
  @IsIn(['draft','published','archived']) status!: HelpStatus;
  @IsNumber({ allowNaN: false, allowInfinity: false }) sortWeight!: number;
  @IsInt() @Min(0) expectedVersion!: number;
}
type HelpRevision = { article_id: string; version: number; status: HelpStatus; title_zh: string; title_en: string;
  body_zh: string; body_en: string; keywords: string[]; category: string; sort_weight: number; created_at: Date };
const project = (row: HelpRevision) => ({ id: row.article_id, version: row.version, status: row.status,
  titleZh: row.title_zh, titleEn: row.title_en, bodyZh: row.body_zh, bodyEn: row.body_en,
  keywords: row.keywords, category: row.category, sortWeight: row.sort_weight, updatedAt: row.created_at.toISOString() });

@Injectable()
export class V81HelpService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async list(principal: AuthenticatedPrincipal, query: HelpListQuery) {
    await requireAdminAccess(this.prisma, principal, 'HELP_CENTER');
    const latest = Prisma.sql`SELECT DISTINCT ON (article_id) * FROM v81_help_article_revisions
      WHERE organization_id=${principal.organizationId}::uuid ORDER BY article_id,version DESC`;
    const search = query.search?.trim().toLowerCase() ?? '';
    const filter = Prisma.sql`(${query.status ?? null}::text IS NULL OR status=${query.status ?? null})
      AND (${query.category ?? null}::text IS NULL OR category=${query.category ?? null})
      AND (${search}='' OR strpos(lower(title_zh),${search})>0 OR strpos(lower(title_en),${search})>0
        OR EXISTS(SELECT 1 FROM unnest(keywords) keyword WHERE strpos(lower(keyword),${search})>0))`;
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<HelpRevision[]>(Prisma.sql`WITH latest AS (${latest}) SELECT * FROM latest
        WHERE ${filter} ORDER BY sort_weight DESC,created_at DESC,article_id DESC LIMIT 5 OFFSET ${(query.page - 1) * 5}`);
      const counts = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`WITH latest AS (${latest}) SELECT count(*) AS total FROM latest WHERE ${filter}`);
      const groups = await tx.$queryRaw<{ status: HelpStatus; total: bigint }[]>(Prisma.sql`WITH latest AS (${latest}) SELECT status,count(*) AS total FROM latest GROUP BY status`);
      const count = (status: HelpStatus) => Number(groups.find(row => row.status === status)?.total ?? 0);
      return { items: rows.map(project), page: query.page, pageSize: 5, total: Number(counts[0]?.total ?? 0),
        summary: { draft: count('draft'), published: count('published'), archived: count('archived') } };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async studentArticles(principal: AuthenticatedPrincipal, query: StudentHelpQuery, id?: string) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const rows = await this.prisma.$queryRaw<(HelpRevision & { published_at: Date })[]>`
      WITH latest AS (SELECT DISTINCT ON (article_id) * FROM v81_help_article_revisions
        WHERE organization_id=${principal.organizationId}::uuid ORDER BY article_id,version DESC)
      SELECT latest.*, (SELECT min(r.created_at) FROM v81_help_article_revisions r
        WHERE r.article_id=latest.article_id AND r.status='published') AS published_at
      FROM latest WHERE status='published' AND (${id ?? null}::uuid IS NULL OR article_id=${id ?? null}::uuid)
      ORDER BY sort_weight DESC,created_at DESC,article_id DESC`;
    if (id && !rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return rows.map(row => ({ id: row.article_id, category: row.category, locale: query.locale,
      title: query.locale === 'en' ? row.title_en : row.title_zh,
      bodyMarkdown: query.locale === 'en' ? row.body_en : row.body_zh,
      publishedAt: row.published_at.toISOString(), version: row.version }));
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    await requireAdminAccess(this.prisma, principal, 'HELP_CENTER');
    const rows = await this.prisma.$queryRaw<HelpRevision[]>`SELECT * FROM v81_help_article_revisions
      WHERE article_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid ORDER BY version DESC LIMIT 1`;
    if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return project(rows[0]);
  }

  async save(principal: AuthenticatedPrincipal, id: string | null, input: HelpContentInput & { expectedVersion: number },
    requestId: string, key: string | undefined) {
    await requireAdminAccess(this.prisma, principal, 'HELP_CENTER');
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: id === null ? 'createV81HelpArticle' : 'saveV81HelpArticle',
      scope: `${principal.organizationId}:${id ?? 'new'}`, request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'HELP_CENTER');
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (!permitsSystemMode(policy?.systemMode, principal.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const previous = id === null ? [] : await tx.$queryRaw<HelpRevision[]>`SELECT * FROM v81_help_article_revisions
        WHERE article_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid ORDER BY version DESC LIMIT 1`;
      if (id !== null && !previous[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (input.expectedVersion !== (previous[0]?.version ?? 0)) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      let content;
      try { content = normalizeHelpContent(input, HELP_CATEGORIES, previous[0]?.status); }
      catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error ? error.message : 'HELP_CONTENT_INVALID' }); }
      const articleId = id ?? this.ids.next(), now = this.clock.now(), version = input.expectedVersion + 1;
      if (id === null) await tx.$executeRaw`INSERT INTO v81_help_articles(id,organization_id,created_at)
        VALUES(${articleId}::uuid,${principal.organizationId}::uuid,${now})`;
      await tx.$executeRaw`INSERT INTO v81_help_article_revisions(article_id,organization_id,version,title_zh,title_en,body_zh,body_en,
        keywords,category,status,sort_weight,actor_id,request_id,created_at)
        VALUES(${articleId}::uuid,${principal.organizationId}::uuid,${version},${content.titleZh},${content.titleEn},${content.bodyZh},${content.bodyEn},
          ${content.keywords}::text[],${content.category},${content.status},${content.sortWeight},${principal.userId}::uuid,${requestId},${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'HELP_ARTICLE',${articleId}::uuid,${id === null ? 'CREATED' : 'UPDATED'},
          ${principal.userId}::uuid,${requestId},${version},${JSON.stringify({ previousVersion: previous[0]?.version ?? null,
            previousStatus: previous[0]?.status ?? null, status: content.status })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ id: articleId, ...content, version, updatedAt: now.toISOString() });
    });
  }
}

const helpUuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('admin/help-articles')
export class V81HelpController {
  constructor(private readonly service: V81HelpService) {}
  @Get() @OperationPolicy('listV81HelpArticles')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: HelpListQuery) {
    return this.service.list(principal, query);
  }
  @Get(':articleId') @OperationPolicy('getV81HelpArticle')
  detail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('articleId', helpUuid) id: string) {
    return this.service.detail(principal, id);
  }
  @Post() @OperationPolicy('createV81HelpArticle')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() input: SaveHelpInput,
    @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.save(principal, null, input, req.requestId, key);
  }
  @Post(':articleId') @OperationPolicy('saveV81HelpArticle')
  save(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('articleId', helpUuid) id: string,
    @Body() input: SaveHelpInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.save(principal, id, input, req.requestId, key);
  }
}

@Controller('student/help-articles')
export class V81StudentHelpController {
  constructor(private readonly service: V81HelpService) {}
  @Get() @OperationPolicy('listV81StudentHelpArticles')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: StudentHelpQuery) {
    return this.service.studentArticles(principal, query);
  }
  @Get(':articleId') @OperationPolicy('getV81StudentHelpArticle')
  async detail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: StudentHelpQuery,
    @Param('articleId', helpUuid) id: string) {
    return (await this.service.studentArticles(principal, query, id))[0];
  }
}
