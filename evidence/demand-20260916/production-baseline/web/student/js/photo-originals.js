import piexif from './vendor/piexif.js';
let database;
async function store(mode,work) {
  database ||= new Promise((resolve,reject)=>{const request=indexedDB.open('bnbu.student.photo-originals',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).catch(error=>{database=null;throw error;});
  const db=await database;
  return new Promise((resolve,reject)=>{const tx=db.transaction('photos',mode),result=work(tx.objectStore('photos'));
    tx.oncomplete=()=>resolve(result?.result);tx.onerror=tx.onabort=()=>reject(tx.error);});
}
export async function savePhotoOriginal(owner,id,blob) {
  await store('readwrite',s=>s.put({key:[owner,id],owner,id,blob,name:blob.name||`photo-${id}.jpg`,savedAt:new Date().toISOString()}));
  void navigator.storage?.persist?.().catch(()=>{});
}
export async function listPhotoOriginals(owner) {
  return (await store('readonly',s=>s.getAll(IDBKeyRange.bound([owner],[owner,[]])))).filter(row=>row.owner===owner);
}
export async function removePhotoOriginal(owner,id) {await store('readwrite',s=>s.delete([owner,id]));}
function binary(bytes) {let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return result;}
/** Preserve JPEG compressed pixels, retain camera EXIF, and exclude location/identity metadata from upload. */
export async function prepareJpegEvidence(file) {
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==255||bytes[1]!==216)throw new Error('invalid-jpeg');
  const original=binary(bytes),data=piexif.load(original);
  const allowed={'0th':[256,257,271,272,274,282,283,296,306],'Exif':[33434,33437,34855,36867,36868,37386,40962,40963]};
  const safe={'0th':{},Exif:{},GPS:{},'1st':{},thumbnail:null};
  for(const [group,tags] of Object.entries(allowed))for(const tag of tags)if(data[group]?.[tag]!==undefined)safe[group][tag]=data[group][tag];
  // Drop APP1 and APP13 metadata blocks, including XMP/IPTC, before adding safe EXIF.
  let clean=original.slice(0,2),offset=2;
  while(offset<bytes.length){
    if(bytes[offset]!==255)throw new Error('invalid-jpeg-marker');
    const marker=bytes[offset+1];
    if(marker===218||marker===217){clean+=original.slice(offset);break;}
    const length=(bytes[offset+2]<<8)|bytes[offset+3];if(length<2||offset+2+length>bytes.length)throw new Error('invalid-jpeg-segment');
    if(marker!==225&&marker!==237)clean+=original.slice(offset,offset+2+length);
    offset+=2+length;
  }
  const result=piexif.insert(piexif.dump(safe),clean);
  return new Blob([Uint8Array.from(result,char=>char.charCodeAt(0))],{type:'image/jpeg'});
}
