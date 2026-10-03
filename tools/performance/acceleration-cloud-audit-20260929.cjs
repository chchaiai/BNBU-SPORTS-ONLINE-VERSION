const {AbstractClient}=require('/app/node_modules/tencentcloud-sdk-nodejs-common/tencentcloud/common/abstract_client.js');
const {default:CvmRoleCredential}=require('/app/node_modules/tencentcloud-sdk-nodejs-common/tencentcloud/common/cvm_role_credential.js');
(async()=>{
 for(const [service,version,action,params] of [
  ['cdn','2018-06-06','DescribeDomains',{Offset:0,Limit:100}],
  ['teo','2022-09-01','DescribeZones',{Offset:0,Limit:100}]
 ]){
  try {
   const endpoint=service+'.tencentcloudapi.com';
   const client=new AbstractClient(endpoint,version,{credential:new CvmRoleCredential(),region:'ap-hongkong',profile:{httpProfile:{endpoint,reqTimeout:10}}});
   const r=await client.request(action,params);
   console.log(JSON.stringify({service,action,count:r.TotalNumber??r.TotalCount,resources:(r.Domains||r.Zones||[]).map(x=>({name:x.Domain||x.ZoneName,status:x.Status}))}));
  }catch(e){console.log(JSON.stringify({service,action,error:e.code||e.name,accessExpanded:false}));}
 }
})();
