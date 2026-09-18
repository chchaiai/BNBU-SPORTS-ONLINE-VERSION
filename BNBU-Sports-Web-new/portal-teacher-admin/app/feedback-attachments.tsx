"use client";
import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Video,FileUp,UploadCloud,X,Check,LoaderCircle,FileText,ShieldCheck} from 'lucide-react';
import {currentApiSessionEpoch,request,toUserFacingError} from './api-client';

export type FeedbackAttachment={id:string;fileName:string;mimeType:string;size:number;thumbnail?:string};
export class FeedbackAttachmentError extends Error {}
export const feedbackAccept='.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.pdf,.docx,.xlsx,.pptx,.zip,.txt,.csv';
const formatSize=(size:number)=>size<1024*1024?`${Math.max(1,Math.round(size/1024))} KB`:`${(size/1024/1024).toFixed(1)} MB`;
async function thumbnail(file:File){
  if(!/\.(png|jpe?g|webp)$/i.test(file.name))return undefined;
  try{const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(1,160/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/webp',.8);}catch{return undefined;}
}
export function FeedbackUploader({items,disabled,uploading,onFiles,onRemove}:{items:FeedbackAttachment[];disabled:boolean;uploading:string;onFiles:(files:File[])=>void;onRemove:(id:string)=>void}){
 const input=useRef<HTMLInputElement>(null),[drag,setDrag]=useState(false);const blocked=disabled||items.length>=5;
 const pick=(accept:string)=>{if(blocked)return;if(input.current){input.current.accept=accept;input.current.click();}};
 return <section className="feedback-uploader" aria-label="添加反馈附件"><header><div><h3>添加附件 <span>选填</span></h3><p>一张截图或一段录屏，可以帮助我们更快定位问题</p></div><span className="feedback-count">{items.length} / 5</span></header>
 <div className={`feedback-dropzone${drag?' is-dragging':''}${blocked?' is-disabled':''}`} onDragOver={event=>{event.preventDefault();if(!blocked)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);if(!blocked)onFiles(Array.from(event.dataTransfer.files));}}>
 <span className="feedback-cloud"><UploadCloud size={26}/></span><strong>将文件拖到这里，或选择附件类型</strong><span className="feedback-drop-hint">支持图片、录屏和常用文档，最多上传 5 个</span>
 <div className="feedback-pickers"><button type="button" disabled={blocked} onClick={()=>pick('.jpg,.jpeg,.png,.webp')}><ImagePlus size={20}/><span>图片<small>每张 10 MB 以内</small></span></button><button type="button" disabled={blocked} onClick={()=>pick('.mp4,.mov,.webm')}><Video size={20}/><span>视频<small>每段 50 MB 以内</small></span></button><button type="button" disabled={blocked} onClick={()=>pick(feedbackAccept)}><FileUp size={20}/><span>文件<small>每个 20 MB 以内</small></span></button></div>
 <input ref={input} aria-label="反馈附件" type="file" multiple accept={feedbackAccept} disabled={blocked} hidden onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value='';onFiles(files);}}/>
 </div>
 {uploading&&<div className="feedback-upload-status" role="status"><LoaderCircle size={18} className="feedback-spin"/><span>{uploading}</span><span className="feedback-progress-track"/></div>}
 {items.length>0&&<ul className="feedback-uploaded">{items.map(item=><li key={item.id}><div className={`feedback-file-icon ${item.mimeType.startsWith('video/')?'video':''}`}>{item.thumbnail?<img src={item.thumbnail} alt=""/>:item.mimeType.startsWith('video/')?<Video size={22}/>:item.mimeType.startsWith('image/')?<ImagePlus size={22}/>:<FileText size={22}/>}</div><div className="feedback-file-info"><strong title={item.fileName}>{item.fileName}</strong><small>{formatSize(item.size)} <span><Check size={12}/>已上传</span></small></div><button type="button" aria-label={`移除 ${item.fileName}`} title="移除附件" disabled={disabled} onClick={()=>onRemove(item.id)}><X size={17}/></button></li>)}</ul>}
 <div className="feedback-upload-note"><ShieldCheck size={14}/><span>附件仅你和管理员可见。文档支持 PDF、Word、Excel、PPT、ZIP、TXT、CSV。</span></div></section>;
}
export async function uploadFeedbackAttachment(file:File):Promise<FeedbackAttachment>{
  const epoch=currentApiSessionEpoch();
  const extension=file.name.split('.').pop()?.toLowerCase()??'';
  const limit=['mp4','mov','webm'].includes(extension)?50:['jpg','jpeg','png','webp'].includes(extension)?10:20;
  if(!feedbackAccept.split(',').includes(`.${extension}`))throw new FeedbackAttachmentError('请选择支持的图片、视频或文件格式。');
  if(file.size<1||file.size>limit*1024*1024)throw new FeedbackAttachmentError(`附件不能为空，且不能超过 ${limit} MB。`);
  const pending=await request<{id:string;url:string;method:string;requiredHeaders:Record<string,string>}>('/feedback-attachments',{method:'POST',body:{fileName:file.name,size:file.size}});
  if(epoch!==currentApiSessionEpoch())throw new FeedbackAttachmentError('登录状态已变更，请重新上传。');
  const headers=Object.fromEntries(Object.entries(pending.requiredHeaders).filter(([key])=>key.toLowerCase()!=='content-length'));
  const response=await fetch(pending.url,{method:'PUT',headers,body:file,credentials:'omit',signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw new FeedbackAttachmentError('附件上传失败，请重试。');
  if(epoch!==currentApiSessionEpoch())throw new FeedbackAttachmentError('登录状态已变更，请重新上传。');
  const confirmed=await request<FeedbackAttachment>(`/feedback-attachments/${pending.id}/confirm`,{method:'POST',body:{}});
  return {...confirmed,thumbnail:await thumbnail(file)};
}

export function FeedbackAttachments({feedbackId,locale='zh'}:{feedbackId:string;locale?:'zh'|'en'}){
  const [items,setItems]=useState<FeedbackAttachment[]>([]),[error,setError]=useState(''),[preview,setPreview]=useState<{item:FeedbackAttachment;url:string}|null>(null);
  const [busy,setBusy]=useState('');
  useEffect(()=>{let live=true;const epoch=currentApiSessionEpoch();setItems([]);setPreview(null);setError('');
    void request<{items:FeedbackAttachment[]}>(`/feedback/${feedbackId}/attachments`).then(data=>{if(live&&epoch===currentApiSessionEpoch())setItems(data.items);}).catch(()=>{if(live)setError(locale==='zh'?'附件加载失败，请重新打开反馈。':'Unable to load attachments. Reopen this report.');});
    return()=>{live=false;};},[feedbackId,locale]);
  const open=async(item:FeedbackAttachment)=>{const epoch=currentApiSessionEpoch();setBusy(item.id);setError('');try{
    const data=await request<{url:string}>(`/feedback-attachments/${item.id}/access`,{method:'POST',body:{}});
    if(epoch!==currentApiSessionEpoch())return;setPreview({item,url:data.url});
  }catch(failure){setError(toUserFacingError(failure).message);}finally{setBusy('');}};
  return <section className="feedback-attachments" aria-label={locale==='zh'?'反馈附件':'Attachments'}>
    {items.length>0&&<><h3>{locale==='zh'?'附件':'Attachments'}</h3><div className="feedback-file-list">{items.map(item=><button type="button" className="secondary-button" key={item.id} disabled={Boolean(busy)} onClick={()=>void open(item)}>{busy===item.id?'…':item.mimeType.startsWith('image/')?'▧':item.mimeType.startsWith('video/')?'▷':'↧'} {item.fileName} · {(item.size/1024/1024).toFixed(1)} MB</button>)}</div></>}
    {error&&<p role="alert">{error}</p>}
    {preview&&<div className="feedback-preview">{preview.item.mimeType.startsWith('image/')?<img src={preview.url} alt={preview.item.fileName}/>:preview.item.mimeType.startsWith('video/')?<video src={preview.url} controls preload="metadata"/>:null}<a className="text-button" href={preview.url} target="_blank" rel="noopener noreferrer">{locale==='zh'?'打开 / 下载附件':'Open / download attachment'}：{preview.item.fileName}</a><button type="button" className="text-button" onClick={()=>setPreview(null)}>{locale==='zh'?'收起':'Close'}</button></div>}
  </section>;
}
