import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TeacherWorkspace} from '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/teacher-workspace';
import '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/globals.css';
import '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/teacher-workspace.css';
import '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/app-select.css';
import '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/mobile-workspace.css';
const toast=(value:string)=>document.querySelector('#fixture-toast')!.textContent=value;
function App(){const[active,setActive]=useState('courses');const[requests,setRequests]=useState<string[]>([]);
  useEffect(()=>{const listener=(event:Event)=>setRequests(rows=>[...rows,(event as CustomEvent).detail]);document.addEventListener('fixture-request',listener);return()=>document.removeEventListener('fixture-request',listener);},[]);
  return <main style={{padding:24}}><p>本地性能验证 · 9 名合成学生、25 条记录 · 禁止业务写入</p>
    <nav>{['courses','roster','checkins','grades','exemptions'].map(name=><button key={name} onClick={()=>setActive(name)}>{name}</button>)}</nav>
    <label><input id="fail-evidence" type="checkbox"/>模拟凭证加载失败</label><p id="fixture-toast"/><p>请求数 <output id="fixture-count">{requests.length}</output></p>
    <TeacherWorkspace active={active} direction="forward" mode="real" showToast={toast}/>
    <details><summary>请求记录</summary><pre id="fixture-requests">{JSON.stringify(requests,null,2)}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
