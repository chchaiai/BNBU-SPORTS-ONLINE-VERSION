// Local synthetic browser fixture. Generate before npm run dev; remove the three
// public/bulk-fixture files before building a deployment. No real API is called.
import {build} from 'esbuild';
import {writeFileSync, mkdirSync} from 'node:fs';
mkdirSync('public', {recursive: true});
await build({bundle: true, format: 'esm', jsx: 'automatic', conditions: ['style', 'browser', 'import'], outfile: 'public/bulk-fixture.js',
  define: {'process.env.NODE_ENV': '"development"', 'process.env': '{}'},
  plugins: [{name: 'synthetic-admin-store', setup(build) {
    build.onLoad({filter: /admin-store\.tsx$/}, () => ({contents: `
      const state={currentAdminId:'',users:[]};
      export const useAdminStore=()=>({mode:'real',state,busyKey:null,error:null,clearError(){},run(){}});
    `, loader: 'js'}));
  }}],
  stdin: {resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdminUsers} from './app/admin-users';
import {passwordLogin} from './app/api-client';
import './app/globals.css';
import './app/admin-workspace.css';
import './app/app-select.css';
const userId='00000000-0000-4000-8000-000000000999';
let students=Array.from({length:12},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  userId:crypto.randomUUID(),organizationId:crypto.randomUUID(),studentNumber:'FIX'+String(i+1).padStart(3,'0'),
  fullName:'虚拟学生'+(i+1),gender:'UNKNOWN',gradeYear:2026,collegeName:i<6?'Fixture A':'Fixture B',
  majorName:null,status:'ACTIVE',createdAt:'2026-09-14T00:00:00Z',updatedAt:'2026-09-14T00:00:00Z',deletedAt:null,version:3}));
const user={id:userId,role:'ADMIN',status:'ACTIVE',version:1};
window.fetch=async(input,init={})=>{
 const path=String(input).split('?')[0];
 let data;
 if(path.endsWith('/auth/password-login')) data={sessionId:crypto.randomUUID(),accessToken:'local-fixture',refreshToken:'local-fixture',tokenType:'Bearer',accessTokenExpiresAt:'2099-01-01T00:00:00Z',refreshTokenExpiresAt:'2099-02-01T00:00:00Z',user};
 else if(path.endsWith('/auth/account-security')) data={userId,version:1,mustChangePassword:false,adminKind:location.search.includes('sub')?'SUB':'SUPER',permissions:[]};
 else if(path.endsWith('/students')) data=students;
 else if(path.endsWith('/admin/teacher-accounts')) data={items:[],nextCursor:null};
 else if(path.endsWith('/me')) data={user};
 else if(path.includes('/admin/students/') && path.endsWith('/delete')) {
   const id=path.split('/').at(-2),body=JSON.parse(init.body),target=students.find(s=>s.id===id);
   if(!target||target.version!==body.expectedVersion||target.studentNumber!==body.confirmationStudentNumber||!body.reason.trim()) throw Error('Invalid fixture request');
   students=students.filter(s=>s.id!==id);data={id,deleted:true};
 } else throw Error('Fixture blocked unexpected API: '+path);
 return Response.json({data,meta:{pagination:{hasMore:false,nextCursor:null}}});
};
await passwordLogin('fixture@example.invalid','synthetic');
createRoot(document.getElementById('root')).render(<><p>本地虚拟学生验证：所有 API 均为内存模拟</p><AdminUsers locale='zh'/></>);
`}});
writeFileSync('public/bulk-fixture.html', '<!doctype html><html lang="zh"><meta charset="utf-8"><title>本地批量删除验证</title><link rel="stylesheet" href="/bulk-fixture.css"><div id="root"></div><script type="module" src="/bulk-fixture.js"></script></html>');
console.log('Synthetic preview: http://localhost:4180/bulk-fixture.html');
