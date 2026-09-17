import { tx } from './i18n.js';
import { esc } from './ui.js';

export function uploadProgressHtml(progress, message = '') {
  const percent = progress.phase === 'UPLOADING' && Number.isFinite(progress.percent)
    ? Math.max(0, Math.min(100, Math.floor(progress.percent))) : null;
  return `<div data-checkin-upload-status class="upload-progress-overlay" role="status" aria-live="polite" style="position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.38)">
    <div style="width:min(100%,360px);box-sizing:border-box;padding:28px;border-radius:20px;background:var(--color-surface,#fff);color:var(--color-on-surface,#172032);box-shadow:0 16px 48px rgba(0,0,0,.2);text-align:center">
      <strong>${esc(uploadProgressLabel(progress) || message || tx('正在提交…','Submitting…'))}</strong>
      <div class="evidence-upload-loader ${percent === null ? 'is-processing' : ''}" role="progressbar" aria-label="${esc(tx('当前素材上传进度','Current file upload progress'))}" aria-valuemin="0" aria-valuemax="100" ${percent === null ? '' : `aria-valuenow="${percent}"`} style="--upload-percent:${percent ?? 0}%">
        <span class="evidence-upload-fill"></span><span class="evidence-upload-percentage">${percent === null ? esc(tx('处理中…','Processing…')) : `${percent}%`}</span>
      </div>
      <span>${esc(tx('请保持页面打开，上传完成后仍需服务器确认。','Keep this page open. Server confirmation follows the upload.'))}</span>
    </div></div>`;
}

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
