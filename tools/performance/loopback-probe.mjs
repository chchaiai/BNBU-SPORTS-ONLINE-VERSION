// Same HTTPS virtual host and Nginx, reached through loopback. Bounded diagnostic only.
import fs from 'node:fs';import https from 'node:https';
const p=JSON.parse(fs.readFileSync('/perf/private.json'));
const agent=new https.Agent({keepAlive:true,maxSockets:1,lookup:(h,o,cb)=>o.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)});
const rows=[];
for(let i=0;i<30;i++){
 const teacher=i%3===2,path=teacher?'/exercise-records?classSectionId='+p.fixture.teacherAActiveSectionId+'&limit=20&reviewResult=PENDING':i%3===1?'/exercise-records?limit=50&sort=-businessDate':'/student-progress?limit=20';
 const start=performance.now();
 const result=await new Promise(resolve=>{const r=https.get({hostname:'www.student.bnbusports.cn',path:'/api/v1'+path,agent,headers:{authorization:'Bearer '+(teacher?p.teacherToken:p.students[0].token)}},res=>{let bytes=0;res.on('data',b=>bytes+=b.length);res.on('end',()=>resolve({status:res.statusCode,bytes}));});const t=setTimeout(()=>r.destroy(Error('timeout')),3000);r.on('close',()=>clearTimeout(t));r.on('error',e=>resolve({status:0,error:e.code||e.message}));});
 rows.push({time:new Date().toISOString(),label:teacher?'teacher_pending_records':i%3===1?'student_records':'student_progress',...result,ms:Math.round((performance.now()-start)*100)/100});
 if(result.status!==200)break;
 await new Promise(r=>setTimeout(r,100));
}
agent.destroy();console.log(JSON.stringify({scope:'CVM loopback HTTPS Nginx real API',rows}));
