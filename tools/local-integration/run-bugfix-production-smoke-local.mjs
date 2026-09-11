// Load only the existing isolated browser-test environment, never cloud secrets.
import {readFileSync} from 'node:fs';
import {createServer,request} from 'node:http';
import {foundationEnvironment} from '../../backend/test/helpers/test-environment.ts';
const state=JSON.parse(readFileSync('/workspace/.browser-state/state.json','utf8'));
if(state.database!=='v81_browser_test')throw new Error('Unexpected local database');
const database=new URL('postgresql://sql-postgres:5432/v81_browser_test');database.username=process.env.PGUSER;database.password=process.env.PGPASSWORD;
Object.assign(process.env,foundationEnvironment(database.href,3199),state.secrets,{BNBU_SMOKE_ORIGIN:'http://127.0.0.1:3199',RUNTIME_LOG_DIRECTORY:'/workspace/.browser-state/http-logs'});
const operation=process.argv[2];if(!['media','archives'].includes(operation))throw new Error('Unknown smoke operation');
// Preserve the signed public Host while reaching the private Docker MinIO.
const proxy=operation==='media'?createServer((incoming,outgoing)=>{
 const upstream=request({hostname:'media-minio',port:9000,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);});
 upstream.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
}):null;
if(proxy)await new Promise(resolve=>proxy.listen(19000,'127.0.0.1',resolve));
try{await import(`/app/smoke-bugfix-${operation}.mjs`);}finally{proxy?.closeAllConnections();proxy?.close();}
