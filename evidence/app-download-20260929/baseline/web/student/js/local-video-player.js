// Local-file preview owns its source. Data URLs avoid document-local blob URL
// revocation and Android/Harmony browser blob-media loading inconsistencies.
export function localVideoDataUrl(blob) {
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(reader.error||new Error('Local video read failed'));
  reader.onload=()=>resolve(reader.result);
  reader.readAsDataURL(blob);
 });
}
const loading=new WeakMap();
export function mountLocalVideoPlayer(video,blob,onState) {
 if(loading.has(video))return loading.get(video);
 video.onloadeddata=()=>onState('ready');
 video.onerror=()=>onState('error');
 onState('loading');
 const task=localVideoDataUrl(blob).then(source=>{
  if(!video.isConnected)return;
  // Set only once; do not call load()/play() across user interaction or renders.
  video.src=source;
 }).catch(()=>onState('error'));
 loading.set(video,task);return task;
}
