import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const root=resolve('BNBU-Sports-Web-new/portal-teacher-admin');
const require=createRequire(root+'/package.json');const {build}=require('esbuild');
await build({bundle:true,format:'esm',jsx:'automatic',conditions:['style','browser','import'],outfile:root+'/public/dual-class-fixture.js',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'fixture-store',setup(build){build.onLoad({filter:/admin-store\.tsx$/},()=>({contents:`const state={currentAdminId:'synthetic',users:[]};export const useAdminStore=()=>({mode:'real',state,busyKey:null,error:null,clearError(){},run(){}});`,loader:'js'}))}}],stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {AdminUsers} from './app/admin-users';import {passwordLogin} from './app/api-client';import './app/globals.css';import './app/admin-workspace.css';import './app/app-select.css';
window.bootDualAdmin=async(account,password)=>{await passwordLogin(account,password);createRoot(document.getElementById('fixture')).render(<AdminUsers locale="zh"/>)};
`}});
writeFileSync(root+'/public/dual-class-fixture.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dual-class-fixture.css"></head><body><main id="fixture" style="padding:24px"></main><script type="module" src="/dual-class-fixture.js"></script></body></html>');
