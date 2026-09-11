import test from 'node:test';
import assert from 'node:assert/strict';
import { MigrationCompatibilityService } from '../../src/common/database/migration-compatibility.service.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { foundationMigrations } from '../../src/generated/migration-manifest.generated.js';

type Row={migration_name:string;checksum:string;finished_at:Date|null;rolled_back_at:Date|null};
const now=new Date('2026-09-08T04:00:00Z');
function service(transform:(row:Row)=>Row[]){
  const prisma={$queryRaw:async (_query:unknown,id:string)=>{
    const migration=foundationMigrations.find(item=>item.migrationId===id)!;
    return transform({migration_name:id,checksum:migration.sha256,finished_at:now,rolled_back_at:null});
  }};
  return new MigrationCompatibilityService(prisma as unknown as PrismaService);
}
test('successful retry ignores historical rolled-back failure regardless of row order',async()=>{
  for(const reversed of [false,true]) {
    const result=await service(row=>{
      const rows=[{...row,checksum:'old failed checksum',finished_at:null,rolled_back_at:now},row];
      return reversed?rows.reverse():rows;
    }).check();
    assert.deepEqual(result,{compatible:true,reason:'READY'});
  }
});
test('rolled-back attempt alone is not an applied migration',async()=>{
  assert.deepEqual(await service(row=>[{...row,finished_at:null,rolled_back_at:now}]).check(),{compatible:false,reason:'MISSING'});
});
test('unresolved attempt blocks readiness even if another row is finished',async()=>{
  assert.deepEqual(await service(row=>[row,{...row,finished_at:null}]).check(),{compatible:false,reason:'INCOMPLETE'});
  assert.deepEqual(await service(row=>[{...row,finished_at:null}]).check(),{compatible:false,reason:'INCOMPLETE'});
});
test('duplicate active completions are rejected',async()=>{
  assert.deepEqual(await service(row=>[row,row]).check(),{compatible:false,reason:'INCOMPLETE'});
});
test('applied checksum mismatch still blocks readiness',async()=>{
  assert.deepEqual(await service(row=>[{...row,checksum:'changed'}]).check(),{compatible:false,reason:'CHECKSUM_MISMATCH'});
});
test('database errors fail closed',async()=>{
  assert.deepEqual(await service(()=>{throw new Error('Synthetic unavailable database');}).check(),{compatible:false,reason:'DATABASE_UNAVAILABLE'});
});
