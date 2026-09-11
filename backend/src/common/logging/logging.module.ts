import { Global, Module } from '@nestjs/common';

import { HttpLoggingInterceptor } from './http-logging.interceptor.js';
import { JsonLoggerService } from './json-logger.service.js';
import { RuntimeLogSource } from './runtime-log-source.js';

@Global()
@Module({
  providers: [JsonLoggerService, HttpLoggingInterceptor, RuntimeLogSource],
  exports: [JsonLoggerService, HttpLoggingInterceptor, RuntimeLogSource],
})
export class LoggingModule {}
