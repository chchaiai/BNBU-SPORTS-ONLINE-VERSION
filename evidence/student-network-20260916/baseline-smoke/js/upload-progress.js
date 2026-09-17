import { tx } from './i18n.js';

export function uploadProgressLabel({phase,percent}) {
  if(phase==='UPLOADING')return Number.isFinite(percent)?tx(`正在上传 ${percent}%`,`Uploading ${percent}%`):tx('正在上传…','Uploading…');
  return {WAITING:tx('等待上传','Waiting to upload'),READING:tx('正在读取文件…','Reading file…'),PROCESSING:tx('正在处理文件…','Processing file…'),CONFIRMING:tx('正在确认上传…','Confirming upload…'),SUCCESS:tx('上传成功','Upload complete'),FAILED:tx('上传失败，请保留文件后重试','Upload failed. Keep the file and retry')}[phase] || '';
}

/** Upload progress reports bytes sent, not server verification or business completion. */
export function uploadObject(url,{method='PUT',headers={},body,onProgress=()=>{}}) {
  onProgress({phase:'UPLOADING',percent:0});
  if(typeof XMLHttpRequest==='undefined')return fetch(url,{method,headers,body}).then(response=>{onProgress({phase:'UPLOADING',percent:100});return response;});
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open(method,url,true);xhr.timeout=10*60*1000;
    for(const [name,value] of Object.entries(headers))xhr.setRequestHeader(name,value);
    xhr.upload.onprogress=event=>onProgress({phase:'UPLOADING',percent:event.lengthComputable?Math.min(100,Math.floor(event.loaded/event.total*100)):null});
    xhr.onload=()=>resolve({ok:xhr.status>=200&&xhr.status<300,status:xhr.status,headers:{get:name=>xhr.getResponseHeader(name)}});
    xhr.onerror=()=>reject(new TypeError('Upload network unavailable'));
    xhr.ontimeout=()=>reject(new DOMException('Upload timed out','TimeoutError'));
    xhr.onabort=()=>reject(new DOMException('Upload aborted','AbortError'));
    xhr.send(body);
  });
}
