// Synthetic-only smoke. Emits status/requestId, never credentials or source media.
import { AbstractClient } from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/abstract_client.js';
import CvmRoleCredentialModule from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/cvm_role_credential.js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const { default: Credential } = CvmRoleCredentialModule;
const bytes = await sharp({create:{width:64,height:64,channels:3,background:'white'}}).jpeg().toBuffer();
for (const [service, version, region, action, payload] of [
  ['ims','2020-12-29','ap-guangzhou','ImageModeration',{FileContent:bytes.toString('base64')}],
]) {
  const endpoint = `${service}.tencentcloudapi.com`;
  const client = new AbstractClient(endpoint,version,{credential:new Credential(),region,profile:{signMethod:'TC3-HMAC-SHA256',httpProfile:{endpoint,reqTimeout:30}}});
  try {
    const response = await client.request(action,payload,{signal:AbortSignal.timeout(35000)});
    console.log(JSON.stringify({service,result:'SUCCESS',requestId:response.RequestId,suggestion:response.Suggestion,usage:response.Usage}));
  } catch (error) { console.log(JSON.stringify({service,result:'FAILED',code:error.code ?? error.name,message:String(error.message).slice(0,500),requestId:error.requestId ?? null})); }
}
const key=readFileSync(0,'utf8').trim();
const response=await fetch('https://tokenhub.tencentmaas.com/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:'hy-vision-2.0-instruct',stream:false,max_tokens:128,messages:[{role:'user',content:[{type:'text',text:'This is a synthetic blank image for connection testing. Return JSON only: {"contentSafety":"SAFE","exercise":"NO","sportMatch":"UNCERTAIN","confidence":0.99}'},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${bytes.toString('base64')}`}}]}]})});
const result=await response.json();
console.log(JSON.stringify({service:'tokenhub',result:response.ok?'SUCCESS':'FAILED',httpStatus:response.status,requestId:response.headers.get('x-request-id')??result.id,usage:result.usage,finishReason:result.choices?.[0]?.finish_reason,errorCode:result.error?.code}));
if(!response.ok) process.exitCode=1;
