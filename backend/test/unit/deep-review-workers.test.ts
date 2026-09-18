import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MediaProcessingWorker} from '../../src/modules/media/application/media-processing.worker.js';
import {ExerciseSessionsService} from '../../src/modules/exercise-sessions/application/exercise-sessions.service.js';
import {Logger} from '@nestjs/common';

test('stale media attempts cannot publish success or failure after takeover',async()=>{
 let writes=0;
 const tx={$queryRaw:async()=>[],mediaProcessingAttempt:{findFirst:async()=>({attemptNumber:2,workerId:'replacement',occurredAt:new Date()}),create:async()=>{writes++;}},mediaEvidence:{findUniqueOrThrow:async()=>{writes++;}}};
 const worker=new MediaProcessingWorker({$transaction:async(fn: (tx:unknown)=>unknown)=>fn(tx)} as never,{} as never,{} as never,{now:()=>new Date()} as never,{} as never,{} as never,{} as never,{} as never);
 const claimed={media:{id:'synthetic'},attemptNumber:1,requestId:'synthetic'} as never;
 await worker['completeAttempt'](claimed,{} as never);
 await worker['failAttempt'](claimed,'SYNTHETIC',true);
 assert.equal(writes,0);
});
test('expired media attempt is fenced even without a replacement',async()=>{
 let writes=0;
 const worker=new MediaProcessingWorker({$transaction:async(fn: (tx:unknown)=>unknown)=>fn({$queryRaw:async()=>[],mediaProcessingAttempt:{findFirst:async()=>({attemptNumber:1,workerId:worker['workerId'],occurredAt:new Date(0)})},mediaEvidence:{findUniqueOrThrow:async()=>{writes++;}}})} as never,{} as never,{} as never,{now:()=>new Date()} as never,{} as never,{} as never,{} as never,{} as never);
 await worker['completeAttempt']({media:{id:'synthetic'},attemptNumber:1,requestId:'synthetic'} as never,{} as never);assert.equal(writes,0);
});
test('one automatic completion failure does not stop later sessions',async()=>{
 let calls=0,completed=0;const messages:unknown[]=[];
 const service=Object.create(ExerciseSessionsService.prototype) as ExerciseSessionsService;
 Object.assign(service,{clock:{now:()=>new Date()},logger:{error:(v:unknown)=>messages.push(v)} as unknown as Logger,dueFailures:new Map(),ids:{next:()=> 'synthetic'},
 prisma:{$queryRaw:async()=>[{id:'poison',organization_id:'org'},{id:'healthy',organization_id:'org'}]},
 serializable:async(fn:(tx:unknown)=>unknown)=>{if(++calls===1)throw new Error('synthetic');return fn({$queryRaw:async()=>[{id:'healthy'}],exerciseSession:{findUnique:async()=>({id:'healthy'})}});},materializeCap:async()=>{completed++;}});
 await service.completeDueSessions();assert.equal(completed,1);assert.equal(messages.length,1);assert.ok(service['dueFailures'].has('poison'));
});
