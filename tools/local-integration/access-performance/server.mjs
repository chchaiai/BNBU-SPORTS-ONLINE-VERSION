import {createServer} from '../../../BNBU-Sports-Web-new/portal-teacher-admin/node_modules/vite/dist/node/index.js';
import react from '../../../BNBU-Sports-Web-new/portal-teacher-admin/node_modules/@vitejs/plugin-react/dist/index.js';
import path from 'node:path';
const root=path.resolve('BNBU-Sports-Web-new/portal-teacher-admin'),fixture=path.resolve('tools/local-integration/access-performance');
const server=await createServer({configFile:false,root,define:{'process.env.NEXT_PUBLIC_BNBU_ORGANIZATION_CODE':'"BNBU-TEST"'},resolve:{alias:{react:path.join(root,'node_modules/react'),'react-dom':path.join(root,'node_modules/react-dom')}},
  plugins:[{name:'isolated-performance-fixture',enforce:'pre',resolveId(source,importer){if(source==='./api-client'&&importer?.includes('/portal-teacher-admin/app/'))return path.join(fixture,'fixture-api.ts');},configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__performance-fixture')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__performance-fixture',`<html><div id="root"></div><script type="module" src="/@fs/${fixture.replaceAll('\\','/')}/fixture-entry.tsx"></script></html>`));});}},react()],
  server:{host:'127.0.0.1',port:4196,strictPort:true,fs:{allow:[path.resolve('.')]}},logLevel:'warn'});
await server.listen();console.log('http://127.0.0.1:4196/__performance-fixture');
