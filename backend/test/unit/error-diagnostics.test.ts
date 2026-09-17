import assert from 'node:assert/strict';
import test from 'node:test';
import {Logger,type ArgumentsHost} from '@nestjs/common';
import {HttpExceptionFilter} from '../../src/common/errors/http-exception.filter.js';
import {ApplicationError} from '../../src/common/errors/application-error.js';
import {Clock} from '../../src/common/time/clock.js';

test('known and unexpected HTTP failures share a diagnostic ID with redacted server logs',()=>{
  const warnings:unknown[]=[],errors:unknown[]=[];
  const warn=Logger.prototype.warn,error=Logger.prototype.error;
  Logger.prototype.warn=function(value:unknown){warnings.push(value);};
  Logger.prototype.error=function(value:unknown){errors.push(value);};
  try{
    for(const failure of [new ApplicationError('VALIDATION_FAILED',422),new Error('password=secret-database-connection')]){
      const id='01a0a8ee-636e-779d-a107-4b21a5e6a7da';let body:Record<string,unknown>={};let status=0;
      const response={status(value:number){status=value;return this;},json(value:Record<string,unknown>){body=value;}};
      const host={switchToHttp:()=>({getRequest:()=>({requestId:id,method:'POST',url:'/private@example.invalid?token=secret'}),getResponse:()=>response})} as unknown as ArgumentsHost;
      new HttpExceptionFilter({now:()=>new Date('2026-09-16T00:00:00Z')} as Clock).catch(failure,host);
      assert.equal(body.requestId,id);assert.equal((warnings.at(-1) as {requestId:string}).requestId,id);
      assert.equal(status,failure instanceof ApplicationError?422:500);
      assert.equal(body.code,failure instanceof ApplicationError?'VALIDATION_FAILED':'SYSTEM_INTERNAL_ERROR');
      assert.doesNotMatch(JSON.stringify([body,warnings,errors]),/secret|private@example|password=/);
    }
    assert.equal(errors.length,1);
  }finally{Logger.prototype.warn=warn;Logger.prototype.error=error;}
});
