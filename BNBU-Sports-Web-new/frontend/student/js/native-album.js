// Native hosts expose a bridge only to the trusted student origin.
const waiting = new Map();
let connected = null;
let draining = null;
function bridgeAvailable() { return Boolean(globalThis.BNBUAlbum?.postMessage || globalThis.webkit?.messageHandlers?.BNBUAlbum?.postMessage); }
function nativeRequest(payload) {
  const ios = globalThis.webkit?.messageHandlers?.BNBUAlbum;
  if (ios?.postMessage) return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('ALBUM_TIMEOUT')),30000);
    Promise.resolve().then(()=>ios.postMessage(payload)).then(result=>{
      clearTimeout(timer);if(result.ok)resolve(result);else reject(new Error(result.error));
    },error=>{clearTimeout(timer);reject(error);});
  });
  const bridge = globalThis.BNBUAlbum;
  if (!bridge?.postMessage) return Promise.reject(new Error('NATIVE_ALBUM_UNAVAILABLE'));
  if (connected !== bridge) {
    connected = bridge;
    bridge.onmessage = ({data}) => {
      let result; try { result=JSON.parse(data); } catch { return; }
      const pending=waiting.get(result.requestId); if (!pending) return;
      waiting.delete(result.requestId);clearTimeout(pending.timer);
      if(result.ok)pending.resolve(result);else pending.reject(new Error(result.error));
    };
  }
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    const timer=setTimeout(()=>{waiting.delete(requestId);reject(new Error('ALBUM_TIMEOUT'));},30000);
    waiting.set(requestId,{resolve,reject,timer});
    try {bridge.postMessage(JSON.stringify({...payload,requestId}));}
    catch(error){waiting.delete(requestId);clearTimeout(timer);reject(error);}
  });
}
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
function openQueue() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('bnbu-native-album',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function queueTransaction(mode,work) {
  const db=await openQueue();
  try {return await new Promise((resolve,reject)=>{
    const tx=db.transaction('pending',mode),request=work(tx.objectStore('pending'));
    tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function flushNativeAlbum(owner) {
  if (!owner || !bridgeAvailable()) return {pending:0};
  if(draining)return draining;
  draining=(async()=>{
    if (!(await nativeRequest({operation:'status'})).enabled) return {pending:0,disabled:true};
    const items=(await queueTransaction('readonly',store=>store.getAll())).filter(item=>item.owner===owner);
    for(let index=0;index<items.length;index++) {
      const item=items[index];
      try {
        const sha256=await hash(await item.blob.arrayBuffer());
        const key=await hash(new TextEncoder().encode(item.id+':'+sha256));
        const reply=await nativeRequest({operation:'begin',key,mime:item.blob.type.split(';')[0],size:item.blob.size,sha256});
        if(!reply.saved) {
          for(let offset=0;offset<item.blob.size;offset+=65536) {
            const chunk=new Uint8Array(await item.blob.slice(offset,offset+65536).arrayBuffer());
            let binary='';for(const value of chunk)binary+=String.fromCharCode(value);
            await nativeRequest({operation:'chunk',key,data:btoa(binary)});
          }
          await nativeRequest({operation:'finish',key});
        }
        await queueTransaction('readwrite',store=>store.delete(item.id));
      } catch {return {pending:items.length-index};}
    }
    return {pending:0};
  })().finally(()=>{draining=null;});
  return draining;
}
export async function saveSuccessfulEvidence(owner,recordId,drafts) {
  if(!bridgeAvailable())return {supported:false,pending:0};
  try {
    if(!(await nativeRequest({operation:'status'})).enabled)return {supported:true,pending:0,disabled:true};
  } catch { /* Keep committed evidence queued when the native reply is interrupted. */ }
  for(const draft of drafts) {
    if(!(draft.blob instanceof Blob))throw new Error('ALBUM_BLOB_MISSING');
    await queueTransaction('readwrite',store=>store.put({id:`${owner}:${recordId}:${draft.id}`,owner,blob:draft.blob}));
  }
  const result=await flushNativeAlbum(owner);
  return {supported:true,...result};
}
