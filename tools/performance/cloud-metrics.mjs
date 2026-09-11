// Read-only existing-role access check. No IAM changes or credential output.
import {AbstractClient} from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/abstract_client.js';
import CvmRoleCredentialModule from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/cvm_role_credential.js';
const {default:CvmRoleCredential}=CvmRoleCredentialModule;
const client=new AbstractClient('monitor.tencentcloudapi.com','2018-07-24',{credential:new CvmRoleCredential(),region:'ap-hongkong',profile:{signMethod:'TC3-HMAC-SHA256',httpProfile:{endpoint:'monitor.tencentcloudapi.com',protocol:'https://',reqMethod:'POST',reqTimeout:10}}});
try{
 const r=await client.request('GetMonitorData',{Namespace:'QCE/POSTGRES',MetricName:'Cpu',Period:60,StartTime:new Date(Date.now()-600000).toISOString(),EndTime:new Date().toISOString(),Instances:[{Dimensions:[{Name:'resourceId',Value:'postgres-entm7byh'}]}]});
 console.log(JSON.stringify({time:new Date().toISOString(),metric:'Cpu',result:r}));
}catch(e){console.log(JSON.stringify({time:new Date().toISOString(),metric:'Cpu',error:e.code||e.name,accessExpanded:false}));}
