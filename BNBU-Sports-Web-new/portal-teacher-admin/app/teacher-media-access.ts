import {currentApiSessionEpoch, request} from './api-client';

export type Media = {id:string; url:string; video:boolean; document:boolean; safeMetadata:Record<string,string|number>};
type Entry = {expires:number; promise:Promise<Media>};
const entries = new Map<string, Entry>();
let session = -1;

// In-memory only. Reuse a short-lived capability across list, album and detail.
// The server still authorizes each metadata/capability request independently.
export function loadTeacherMedia(mediaId:string, refresh=false):Promise<Media> {
  const epoch=currentApiSessionEpoch();
  if(session!==epoch){entries.clear();session=epoch;}
  const cached=entries.get(mediaId);
  if(!refresh&&cached&&cached.expires>Date.now())return cached.promise;
  const entry:Entry={expires:Date.now()+30_000,promise:Promise.resolve(null as unknown as Media)};
  entry.promise=Promise.all([
    request<{id:string;mediaType:string;uploadStatus:string;safeMetadata?:Record<string,string|number>}>(`/media/${encodeURIComponent(mediaId)}`),
    request<{accessUrl:string;expiresAt:string}>(`/media/${encodeURIComponent(mediaId)}/access-url`,{method:'POST',body:{purpose:'VIEW_ORIGINAL'}}),
  ]).then(([item,access])=>{
    if(epoch!==currentApiSessionEpoch()||item.id!==mediaId||item.uploadStatus!=='AVAILABLE'||!['IMAGE','VIDEO','DOCUMENT'].includes(item.mediaType))throw new Error('Media unavailable');
    const expiration=Date.parse(access.expiresAt);
    entry.expires=Math.min(entry.expires,Number.isFinite(expiration)?expiration-5000:0);
    return {id:mediaId,url:access.accessUrl,video:item.mediaType==='VIDEO',document:item.mediaType==='DOCUMENT',safeMetadata:item.safeMetadata??{}};
  }).catch(error=>{if(entries.get(mediaId)===entry)entries.delete(mediaId);throw error;});
  if(entries.size>=64)entries.delete(entries.keys().next().value!);
  entries.set(mediaId,entry);
  return entry.promise;
}
