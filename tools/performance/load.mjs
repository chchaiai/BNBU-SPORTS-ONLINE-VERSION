// External HTTPS load generator: hard limits, bounded requests, fail-closed monitoring.
import fs from 'node:fs';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {monitorEventLoopDelay} from 'node:perf_hooks';
const args=process.argv.slice(2),mode=args[0]||'smoke',vus=Number(args[1]||1),seconds=Number(args[2]||20),thinkMs=Number(args[3]??5000);
if(!['smoke','stage','write'].includes(mode)||!Number.isInteger(vus)||vus<1||vus>200||seconds<5||seconds>600||thinkMs<0)throw Error('Outside approved bounds');
const priv=JSON.parse(fs.readFileSync('.local/performance-20260911/load-private.json'));
if(Date.now()-Date.parse(priv.tokenIssuedAt)>(900-seconds-30)*1000)throw Error('Refresh tokens before stage');
const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+mode+'-'+vus;
const dir='docs/performance/evidence-20260911/'+runId;fs.mkdirSync(dir,{recursive:true});
const write=(name,value)=>fs.appendFileSync(dir+'/'+name,JSON.stringify(value)+'\n');
const agent=new https.Agent({keepAlive:true,maxSockets:200,maxFreeSockets:200,lookup:(hostname,opts,cb)=>opts.all?cb(null,[{address:'43.129.193.7',family:4}]):cb(null,'43.129.193.7',4)});
let stopped=null,latestMonitor=null,monitorTime=0,highCpu=0,highLatency=0,peakInflight=0,inflight=0,issued=0,rateTokens=0,lastRefill=performance.now(),all=[],windowRows=[];
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
const stop=reason=>{if(!stopped){stopped=reason;console.log(JSON.stringify({event:'STOP',reason}));}};
const ssh=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-i','C:/Users/23328/Desktop/SSH_CVM密钥/BNBU_SPORTS_HK.pem','ubuntu@43.129.193.7','sudo -n python3 /home/ubuntu/bnbu-performance-20260911/host-monitor.py'],{windowsHide:true});
let buffer='';
ssh.stdout.on('data',chunk=>{buffer+=chunk;let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);try{const m=JSON.parse(line);write('monitor.jsonl',m);latestMonitor=m;monitorTime=Date.now();highCpu=m.cpuPct>85?highCpu+1:0;if(m.error||m.health!==200)stop('monitor_or_health_failure');if(m.availableMiB<500)stop('available_memory_below_500MiB');if(highCpu>=3)stop('host_CPU_above_85pct_15s');if(m.state&&!m.state.split('\n').every(l=>l.endsWith(' 0 false healthy')))stop('container_state_changed');for(const c of m.containers||[])if(c.Name==='bnbu-sports-production-backend-1'&&parseFloat(c.MemPerc)>85)stop('backend_memory_above_85pct');if(m.db?.error||Date.now()-Date.parse(m.db?.time)>20000)stop('database_monitor_stale');if(Number(m.db?.locks?.waiting)>0)stop('database_waiting_lock');}catch{stop('invalid_monitor');}}});
ssh.stderr.on('data',()=>{});ssh.on('exit',()=>{if(!finished)stop('monitor_disconnected');});
let finished=false;
function percentile(rows,p){if(!rows.length)return 0;const v=rows.map(x=>x.ms).sort((a,b)=>a-b);return Math.round(v[Math.min(v.length-1,Math.ceil(v.length*p)-1)]*100)/100;}
function summary(rows){return {requests:rows.length,errors:rows.filter(x=>!x.ok).length,p50:percentile(rows,.5),p95:percentile(rows,.95),p99:percentile(rows,.99),maxMs:rows.length?Math.max(...rows.map(x=>x.ms)):0};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function throttle(){while(!stopped){const now=performance.now();rateTokens=Math.min(5,rateTokens+(now-lastRefill)*.15);lastRefill=now;if(rateTokens>=1){rateTokens--;return true;}await sleep(8);}return false;}
async function req(user,path,label,body,method='GET',key){
 if(!await throttle())return null;
 const start=performance.now();inflight++;peakInflight=Math.max(peakInflight,inflight);issued++;
 const result=await new Promise(resolve=>{
  const payload=body===undefined?undefined:JSON.stringify(body);
  const request=https.request({hostname:'www.student.bnbusports.cn',port:443,path:'/api/v1'+path,method,agent,headers:{authorization:'Bearer '+user.token,'user-agent':'BNBU-bounded-capacity-test/20260911',...(payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload),'idempotency-key':key||randomUUID()}:{} )}},response=>{const ttfbMs=performance.now()-start;let data='';response.on('data',x=>{data+=x;if(data.length>2000000)request.destroy(Error('response_too_large'));});response.on('end',()=>{let value;try{value=JSON.parse(data);}catch{}resolve({ttfbMs,status:response.statusCode,ok:response.statusCode>=200&&response.statusCode<300&&!!value&&'data' in value,value,bytes:Buffer.byteLength(data)});});});
  const timer=setTimeout(()=>request.destroy(Error('deadline')),6000);request.on('close',()=>clearTimeout(timer));request.on('error',e=>resolve({status:0,ok:false,error:e.code||e.message,bytes:0}));request.end(payload);
 });
 inflight--;const row={time:new Date().toISOString(),label,method,status:result.status,ok:result.ok,ms:Math.round((performance.now()-start)*100)/100,bytes:result.bytes,ttfbMs:result.ttfbMs===undefined?null:Math.round(result.ttfbMs*100)/100,items:Array.isArray(result.value?.data)?result.value.data.length:null,...(!result.ok?{code:result.value?.error?.code||result.value?.code||result.error}: {})};all.push(row);windowRows.push(row);write('requests.jsonl',row);return result;
}
function route(i,user){const section=priv.fixture.teacherAActiveSectionId;const studentRoutes=[['/me','student_me'],['/enrollments','student_enrollments'],['/exercise-records?limit=50&sort=-businessDate','student_records'],['/exercise-sessions/active','student_active'],['/student-progress?limit=20','student_progress'],['/notifications?limit=20','student_notifications'],['/student/proof-todos?limit=20','student_todos'],['/exercise-records?limit=50&sort=-businessDate','student_records'],['/exercise-sessions/active','student_active']];if(i%10===9){const teacherRoutes=[['/enrollments?classSectionId='+section+'&limit=20','teacher_roster'],['/exercise-records?classSectionId='+section+'&limit=20&reviewResult=PENDING','teacher_pending_records']];return {user:{token:priv.teacherToken},route:teacherRoutes[Math.floor(i/10)%2]};}return {user,route:studentRoutes[i%10]};}
const started=new Date().toISOString();
try{
 for(let i=0;i<40&&!latestMonitor&&!stopped;i++)await sleep(250);
 if(!latestMonitor)stop('monitor_start_timeout');
 const stageStart=performance.now(),deadline=stageStart+seconds*1000;
 const interval=setInterval(()=>{const w=windowRows;windowRows=[];const s=summary(w);write('windows.jsonl',{time:new Date().toISOString(),...s,loopP99Ms:loop.percentile(99)/1e6,inflight});loop.reset();console.log(JSON.stringify({event:'window',vus,...s,cpu:latestMonitor?.cpuPct}));if(s.requests>=20&&s.errors/s.requests>.01)stop('error_rate_above_1pct');highLatency=s.requests>=10&&s.p95>2000?highLatency+1:0;if(highLatency>=2)stop('p95_above_2s_two_windows');if(Date.now()-monitorTime>15000)stop('host_monitor_stale');},10000);
 if(mode==='smoke'){
  for(let i=0;i<20&&!stopped;i++){const r=route(i,priv.students[0]);const result=await req(r.user,...r.route);if(!result?.ok)stop('smoke_route_failed_'+r.route[1]);}
 }else if(mode==='write'){
  await Promise.all(Array.from({length:vus},async(_,i)=>{
   const user=priv.students[i];await sleep(i*100);
   if(stopped)return;
   const start=await req(user,'/exercise-sessions','session_start',{enrollmentId:user.enrollmentId,clientObservedAt:new Date().toISOString()},'POST');
   if(!start?.ok){stop('write_start_failed');return;}
   let session=start.value.data;
   for(const action of ['pause','resume','cancel']){
    const body=action==='cancel'?{expectedVersion:session.version,reason:'Bounded synthetic capacity test completed'}:{expectedVersion:session.version,clientObservedAt:new Date().toISOString()};
    const result=await req(user,'/exercise-sessions/'+session.id+'/'+action,'session_'+action,body,'POST');
    if(!result?.ok){stop('write_control_failed');return;}session=result.value.data;
   }
  }));
 }else{
  await Promise.all(Array.from({length:vus},async(_,i)=>{await sleep(thinkMs?i*thinkMs/vus:Math.min(i*10,1000));let n=i;while(!stopped&&performance.now()<deadline){const r=route(n++,priv.students[i]);const begin=performance.now();await req(r.user,...r.route);if(thinkMs)await sleep(Math.max(0,thinkMs-(performance.now()-begin)));}}));
 }
 clearInterval(interval);
 const elapsed=(performance.now()-stageStart)/1000;
 const result={runId,started,ended:new Date().toISOString(),mode,vus,seconds,thinkMs,elapsed,stopped,peakInflight,issued,...summary(all),rps:all.length/elapsed,byRoute:Object.fromEntries([...new Set(all.map(x=>x.label))].map(label=>[label,summary(all.filter(x=>x.label===label))]))};
 fs.writeFileSync(dir+'/summary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{finished=true;ssh.kill();agent.destroy();loop.disable();}
