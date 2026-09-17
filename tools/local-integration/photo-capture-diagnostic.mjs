import fs from 'node:fs/promises';
import {chromium,webkit} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const results=[];
for(const [engine,launcher,options] of [['chromium',chromium,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}],['webkit',webkit,{}]]){
 const b=await launcher.launch({...options,headless:true});
 try{const p=await b.newPage();await p.goto('https://www.student.bnbusports.cn/student/');const result=await p.evaluate(async()=>{const m=await import('/student/js/photo-originals.js');const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);const file=new File([await new Promise(r=>c.toBlob(r,'image/jpeg',.9))],'live_photo_test.jpg',{type:'image/jpeg'});const result={};for(const [name,fn]of [['save',()=>m.savePhotoOriginal('synthetic-photo-diagnostic','one',file)],['normalize',()=>m.prepareJpegEvidence(file)]]){try{await fn();result[name]='PASS';}catch(e){result[name]={name:e?.name??null,message:e?.message??String(e)};}}await m.removePhotoOriginal('synthetic-photo-diagnostic','one');return result;});results.push({engine,...result});}finally{await b.close();}
}
await fs.writeFile('evidence/photo-capture-20260916/before-deploy.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
