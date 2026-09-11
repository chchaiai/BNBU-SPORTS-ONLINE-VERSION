import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuditModule } from './common/audit/audit.module.js';
import { validateEnvironment } from './common/config/environment.js';
import { RuntimeConfigModule } from './common/config/runtime-config.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { FoundationCommonModule } from './common/foundation-common.module.js';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor.js';
import { BodyParserErrorMiddleware } from './common/http/body-parser-error.middleware.js';
import { RequestIdMiddleware } from './common/http/request-id.js';
import { HttpLoggingInterceptor } from './common/logging/http-logging.interceptor.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { IdempotencyModule } from './common/idempotency/idempotency.module.js';
import { OutboxModule } from './common/outbox/outbox.module.js';
import { AccessPolicyGuard } from './common/policy/access-policy.guard.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { AccessTokenGuard } from './modules/auth/access-token.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClassSectionsModule } from './modules/class-sections/class-sections.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { RosterModule } from './modules/roster/roster.module.js';
import { ExerciseSessionsModule } from './modules/exercise-sessions/exercise-sessions.module.js';
import { ExerciseRecordsModule } from './modules/exercise-records/exercise-records.module.js';
import { JoinCapabilitiesModule } from './modules/join-capabilities/join-capabilities.module.js';
import { SemestersModule } from './modules/semesters/semesters.module.js';
import { SystemModeGuard } from './modules/system-mode/system-mode.guard.js';
import { SystemModeModule } from './modules/system-mode/system-mode.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { ExerciseReviewsModule } from './modules/exercise-reviews/exercise-reviews.module.js';
import { ScoresModule } from './modules/scores/scores.module.js';
import { ExportsModule } from './modules/exports/exports.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { ClientCapabilitiesModule } from './modules/client-capabilities/client-capabilities.module.js';
import { V81Module } from './modules/v8/v81.module.js';
import { V81AdminPermissionGuard } from './common/policy/v81-admin-permission.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, validate: validateEnvironment }),
    RuntimeConfigModule,
    FoundationCommonModule,
    DatabaseModule,
    LoggingModule,
    RateLimitModule,
    IdempotencyModule,
    AuditModule,
    OutboxModule,
    AuthModule,
    ClassSectionsModule,
    CoursesModule,
    JoinCapabilitiesModule,
    EnrollmentsModule,
    RosterModule,
    ExerciseSessionsModule,
    ExerciseRecordsModule,
    ExerciseReviewsModule,
    ScoresModule,
    ExportsModule,
    AuditLogsModule,
    ClientCapabilitiesModule,
    MediaModule,
    HealthModule,
    SystemModeModule,
    OrganizationsModule,
    SemestersModule,
    UsersModule,
    V81Module,
  ],
  providers: [
    RequestIdMiddleware,
    BodyParserErrorMiddleware,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: AccessPolicyGuard },
    { provide: APP_GUARD, useClass: V81AdminPermissionGuard },
    { provide: APP_GUARD, useClass: SystemModeGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
