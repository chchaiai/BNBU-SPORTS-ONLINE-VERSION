"use client";
/* eslint-disable @next/next/no-img-element -- Private signed originals must not pass through the public image optimizer. */
import {useEffect,useState} from 'react';
import {currentApiSessionEpoch,request,toUserFacingError,type UserFacingError} from './api-client';
import {openTeacherMedia} from './teacher-data';
import {ErrorPanel} from './error-panel';

export function TeacherMediaPreview({mediaId,label}:{mediaId:string;label:string}) {
  const [media,setMedia]=useState<{url:string;video:boolean}|null>(null);
  const [error,setError]=useState<UserFacingError|null>(null);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let live=true;const epoch=currentApiSessionEpoch();setMedia(null);setError(null);
    void (async()=>{
      const item=await request<{id:string;mediaType:string;uploadStatus:string}>(`/media/${encodeURIComponent(mediaId)}`);
      if(item.id!==mediaId || !['IMAGE','VIDEO'].includes(item.mediaType) || item.uploadStatus!=='AVAILABLE') throw new Error('Media unavailable');
      const url=await openTeacherMedia(mediaId);
      if(live&&epoch===currentApiSessionEpoch())setMedia({url,video:item.mediaType==='VIDEO'});
    })().catch(failure=>{if(live&&epoch===currentApiSessionEpoch())setError(toUserFacingError(failure));});
    return()=>{live=false;};
  },[mediaId,retry]);
  return <div className="teacher-original-media" data-media-id={mediaId}>
    {error?<ErrorPanel error={error}/>:!media?<p role="status">正在加载学生原始材料…</p>:media.video?
      <video key={media.url} src={media.url} controls playsInline preload="metadata" aria-label={label} onError={()=>setError({...toUserFacingError(null),message:'视频未能加载，请重新获取原件后重试。'})} style={{width:'100%',maxHeight:480}}/>:
      <img src={media.url} alt={label} onError={()=>setError({...toUserFacingError(null),message:'图片未能加载，请重新获取原件后重试。'})} style={{width:'100%',maxHeight:480,objectFit:'contain'}}/>}
    {error&&<button type="button" className="secondary-button" onClick={()=>setRetry(value=>value+1)}>重新加载原件</button>}
  </div>;
}
