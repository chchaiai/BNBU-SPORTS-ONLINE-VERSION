import https from 'node:https';import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('.local/performance-20260911/load-private.json'));
const tests=[['www.student.bnbusports.cn','/student/',200],['www.teacher.bnbusports.cn','/',200],['bnbusports.cn','/',200],['www.student.bnbusports.cn','/api/v1/health/ready',200],['www.teacher.bnbusports.cn','/api/v1/health/ready',200],['www.student.bnbusports.cn','/api/v1/me',401]];
const agent=new https.Agent({keepAlive:true,lookup:(h,o,cb)=>o.all?cb(null,[{address:'43.129.193.7',family:4}]):cb(null,'43.129.193.7',4)});
const rows=[];
for(const [hostname,path,expected] of tests){
 const start=performance.now();
 const result=await new Promise(resolve=>{
  const r=https.get({hostname,path,agent,headers:path==='/api/v1/me'?{authorization:'Bearer '+p.students[0].token}:{}},res=>{let bytes=0;res.on('data',x=>bytes+=x.length);res.on('end',()=>resolve({status:res.statusCode,bytes}));});
  const t=setTimeout(()=>r.destroy(Error('timeout')),6000);r.on('close',()=>clearTimeout(t));r.on('error',e=>resolve({status:0,error:e.code||e.message}));
 });
 rows.push({time:new Date().toISOString(),hostname,path,expected,...result,ms:Math.round(performance.now()-start),pass:result.status===expected});
}
agent.destroy();fs.writeFileSync('docs/performance/evidence-20260911/recovery-http.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));if(rows.some(r=>!r.pass))process.exitCode=1;
