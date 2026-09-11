"use client";
/* eslint-disable @next/next/no-img-element -- Signed private media bypasses public optimization. */
import {useEffect,useRef,useState} from 'react';
import {currentApiSessionEpoch,request} from './api-client';
import {openTeacherMedia} from './teacher-data';

export function TeacherMediaThumbnail({mediaId,label}:{mediaId?:string;label:string}) {
 const root=useRef<HTMLSpanElement>(null);
 const [visible,setVisible]=useState(false),[attempt,setAttempt]=useState(0);
 const [media,setMedia]=useState<{id:string;url:string;video:boolean}|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{const element=root.current;if(!element)return;const observer=new IntersectionObserver(entries=>{
  if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
 },{rootMargin:'120px'});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!visible||!mediaId)return;
  let live=true;const epoch=currentApiSessionEpoch();
  void(async()=>{
   const item=await request<{id:string;mediaType:string;uploadStatus:string}>(`/media/${encodeURIComponent(mediaId)}`);
   if(item.id!==mediaId||item.uploadStatus!=='AVAILABLE'||!['IMAGE','VIDEO'].includes(item.mediaType))throw new Error('Unavailable');
   const url=await openTeacherMedia(mediaId);
   if(live&&epoch===currentApiSessionEpoch()){setFailed(false);setMedia({id:mediaId,url,video:item.mediaType==='VIDEO'});}
  })().catch(()=>{if(live&&epoch===currentApiSessionEpoch())setFailed(true);});
  return()=>{live=false;};
 },[mediaId,visible,attempt]);
 const failedMedia=()=>{if(attempt===0){setMedia(null);setAttempt(1);}else setFailed(true);};
 return <span ref={root} className="teacher-media-thumbnail" data-thumbnail-media-id={mediaId}>
  {!mediaId||failed?<span className="media-thumbnail-status">预览暂不可用<br/>点击查看材料</span>:!media||media.id!==mediaId?<span className="media-thumbnail-status" role="status">加载预览…</span>:media.video?<>
   <video src={media.url+'#t=0.1'} muted playsInline preload="metadata" aria-label={label} onLoadedMetadata={event=>{const video=event.currentTarget;if(Number.isFinite(video.duration)&&video.duration>0.1)video.currentTime=0.1;}} onError={failedMedia}/>
   <span className="media-thumbnail-play" aria-hidden="true">▶</span>
  </>:<img src={media.url} alt={label} loading="lazy" onError={failedMedia}/>}
 </span>;
}
