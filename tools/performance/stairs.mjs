import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const key='C:/Users/23328/Desktop/SSH_CVM密钥/BNBU_SPORTS_HK.pem';
const levels=(process.argv[2]||'1,5,10,20,40,80,120,160,200').split(',').map(Number);
const seconds=Number(process.argv[3]||60),think=Number(process.argv[4]??5000);
const mode=process.argv[5]||'stage';if(!['stage','write'].includes(mode))throw Error('Invalid mode');
if(levels.some(x=>x<1||x>200)||levels.length>9||seconds>600||seconds<10||think<0)throw Error('Invalid bounded staircase');
for(const vus of levels){
 const p=JSON.parse(fs.readFileSync('.local/performance-20260911/load-private.json'));
 if(Date.now()-Date.parse(p.tokenIssuedAt)>(850-seconds)*1000){
  for(const [cmd,args] of [['ssh',['-o','BatchMode=yes','-i',key,'ubuntu@43.129.193.7','sudo -n python3 /home/ubuntu/bnbu-performance-20260911/remote-helper.py refresh']],['scp',['-q','-i',key,'ubuntu@43.129.193.7:/home/ubuntu/bnbu-performance-20260911/load-private.json','.local/performance-20260911/load-private.json']]]){
   const r=spawnSync(cmd,args,{stdio:'inherit',windowsHide:true,timeout:90000});if(r.status!==0)process.exit(1);
  }
 }
 const run=spawnSync(process.execPath,['tools/performance/load.mjs',mode,String(vus),String(seconds),String(think)],{stdio:'inherit',windowsHide:true,timeout:(seconds+40)*1000});
 if(run.status!==0)process.exit(1);
 const root='docs/performance/evidence-20260911';const last=fs.readdirSync(root).filter(x=>x.endsWith('-'+mode+'-'+vus)).sort().at(-1);
 const result=JSON.parse(fs.readFileSync(root+'/'+last+'/summary.json'));
 if(result.stopped||result.errors||result.p95>2000){console.log('STAIRCASE_STOPPED');break;}
}
