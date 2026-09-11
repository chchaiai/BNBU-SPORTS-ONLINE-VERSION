import { Inject, Injectable } from '@nestjs/common';
import { open, readdir, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import type { RuntimeConfig } from '../config/environment.js';
import { OrganizationTimeService } from '../time/organization-time.service.js';
import { operationPolicies } from '../../generated/operation-policies.generated.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export function safeHttpRuntimeRecord(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.msg !== 'http_request_completed' || typeof r.organizationId !== 'string' || !uuid.test(r.organizationId)) return null;
  if (typeof r.time !== 'string' || !Number.isFinite(Date.parse(r.time)) || typeof r.requestId !== 'string' ||
    r.requestId.length > 64 || !/^[A-Za-z0-9._-]+$/u.test(r.requestId) || !['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(String(r.method)) ||
    !Number.isInteger(r.statusCode) || Number(r.statusCode) < 100 || Number(r.statusCode) > 599 ||
    typeof r.durationMs !== 'number' || !Number.isFinite(r.durationMs) || r.durationMs < 0) throw new Error('RUNTIME_LOG_SOURCE_INVALID');
  const operationId = typeof r.operationId === 'string' && Object.hasOwn(operationPolicies,r.operationId) ? r.operationId : null;
  const route = operationId ? '/api/v1/' + operationPolicies[operationId as keyof typeof operationPolicies].route.replace(/^\//u,'') : '/api/v1/unknown';
  return { organizationId:r.organizationId.toLowerCase(),time:new Date(r.time).toISOString(),kind:'HTTP' as const,requestId:r.requestId,
    operationId,route,method:String(r.method),statusCode:Number(r.statusCode),durationMs:r.durationMs,
    outcome:r.outcome === 'SUCCEEDED' || r.outcome === 'FAILED' ? r.outcome : null,
    errorCode:typeof r.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/u.test(r.errorCode) ? r.errorCode : null };
}

@Injectable()
export class RuntimeLogSource {
  constructor(@Inject(RUNTIME_CONFIG) private readonly config:RuntimeConfig) {}
  async read(organizationId:string,startDate:string,endDate:string,timezone:string) {
    if (!uuid.test(organizationId)) throw new Error('RUNTIME_LOG_SCOPE_INVALID');
    for (const date of [startDate,endDate]) {
      const stamp=new Date(date+'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(stamp.getTime()) || stamp.toISOString().slice(0,10)!==date || date.startsWith('0000'))
        throw new Error('RUNTIME_LOG_DATE_INVALID');
    }
    if (startDate>endDate) throw new Error('RUNTIME_LOG_DATE_INVALID');
    const directory=this.config.runtimeLogDirectory;
    if (!directory || !isAbsolute(directory)) throw new Error('RUNTIME_LOG_SOURCE_UNAVAILABLE');
    let root:string;
    try { root=await realpath(directory); } catch { throw new Error('RUNTIME_LOG_SOURCE_UNAVAILABLE'); }
    const entries=(await readdir(root,{withFileTypes:true})).filter(e=>/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.ndjson$/u.test(e.name));
    if (!entries.length) throw new Error('RUNTIME_LOG_SOURCE_UNAVAILABLE');
    if (entries.length>1000) throw new Error('RUNTIME_LOG_SOURCE_TOO_LARGE');
    const records:NonNullable<ReturnType<typeof safeHttpRuntimeRecord>>[]=[], sources:{sha256:string;byteLength:number}[]=[];
    const time=new OrganizationTimeService();
    let totalBytes=0;
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('RUNTIME_LOG_SOURCE_INVALID');
      const file=resolve(root,entry.name);
      if (!file.startsWith(root+sep)) throw new Error('RUNTIME_LOG_SOURCE_INVALID');
      const handle=await open(file,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat=await handle.stat();
        if (!stat.isFile() || totalBytes+stat.size>64*1024*1024) throw new Error('RUNTIME_LOG_SOURCE_TOO_LARGE');
        if (!stat.size) continue;
        const chunks:Buffer[]=[];
        for await (const chunk of handle.createReadStream({autoClose:false,start:0,end:stat.size-1})) chunks.push(Buffer.from(chunk));
        const bytes=Buffer.concat(chunks); totalBytes+=bytes.length;
        if (bytes.length!==stat.size || bytes.at(-1)!==10) throw new Error('RUNTIME_LOG_SOURCE_INCOMPLETE');
        sources.push({sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length});
        for (const line of bytes.toString('utf8').split('\n')) {
          if (!line.trim()) continue;
          if (Buffer.byteLength(line)>65536) throw new Error('RUNTIME_LOG_SOURCE_INVALID');
          let parsed:unknown;
          try { parsed=JSON.parse(line); } catch { throw new Error('RUNTIME_LOG_SOURCE_INVALID'); }
          const record=safeHttpRuntimeRecord(parsed);
          if (!record || record.organizationId!==organizationId.toLowerCase()) continue;
          const day=time.businessDate(new Date(record.time),timezone);
          if (day>=startDate && day<=endDate) records.push(record);
          if (records.length>100000) throw new Error('RUNTIME_LOG_SOURCE_TOO_LARGE');
        }
      } finally { await handle.close(); }
    }
    if (!sources.length) throw new Error('RUNTIME_LOG_SOURCE_UNAVAILABLE');
    records.sort((a,b)=>a.time.localeCompare(b.time)||a.requestId.localeCompare(b.requestId));
    return { sourceType:'STRUCTURED_HTTP_RUNTIME' as const,startDate,endDate,timezone,sources,records,
      coverage:'AVAILABLE_SCOPED_HTTP_RECORDS_ONLY' as const };
  }
}
