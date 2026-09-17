let database;
async function db() {
  if(!database)database=new Promise((resolve,reject)=>{const request=indexedDB.open('bnbu-application-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).catch(error=>{database=null;throw error;});
  return database;
}
async function operation(mode,work) {const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('drafts',mode),request=work(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(tx.error);});}
let writes=Promise.resolve();
const enqueue=work=>{const result=writes.then(work);writes=result.catch(()=>{});return result;};
export async function readApplicationDraft(owner) {
  await writes;
  const form=await operation('readonly',store=>store.get(owner));
  if(!form)return form;
  return {...form,proofs:(form.proofs || []).map(proof=>{
    const {fileBytes,fileType,fileModified,...rest}=proof;
    return fileBytes ? {...rest,file:new File([fileBytes],proof.name,{type:fileType,lastModified:fileModified})} : rest;
  })};
}
// ArrayBuffers avoid platform-specific IndexedDB Blob/File storage failures.
export const writeApplicationDraft=(owner,form)=>enqueue(async()=>{
  const proofs=await Promise.all(form.proofs.map(async proof=>{
    const {file,...rest}=proof;
    return file ? {...rest,fileBytes:await file.arrayBuffer(),fileType:file.type,fileModified:file.lastModified} : rest;
  }));
  return operation('readwrite',store=>store.put({...form,proofs},owner));
});
export const deleteApplicationDraft=owner=>enqueue(()=>operation('readwrite',store=>store.delete(owner)));
