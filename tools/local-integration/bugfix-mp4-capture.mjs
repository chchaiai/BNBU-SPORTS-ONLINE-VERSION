import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4274/student/');
 const result=await page.evaluate(async()=>{
  const options=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4'];const supported=options.filter(type=>MediaRecorder.isTypeSupported(type));
  if(!supported.length)return {supported};const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});const recorder=new MediaRecorder(stream,{mimeType:supported[0]}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const ended=new Promise(resolve=>{recorder.onstop=resolve;});recorder.start(250);await new Promise(resolve=>setTimeout(resolve,3000));recorder.stop();await ended;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:recorder.mimeType});return {supported,type:blob.type,bytes:[...new Uint8Array(await blob.arrayBuffer())]};
 });
 if(result.bytes)fs.writeFileSync('.local/v81-browser-state/bugfix-native-capture.mp4',Buffer.from(result.bytes));
 console.log(JSON.stringify({supported:result.supported,type:result.type,bytes:result.bytes?.length}));
}finally{await browser.close();}
