// Durable proof bytes, scoped to the signed-in student and exercise/supplement.
// Blob URLs are document-local and must be rebuilt after a page restart.
const DB_NAME = "bnbu.student.web.checkin-drafts";
let database;
let writes = Promise.resolve();
const enqueue = work => {
  const result = writes.then(work).catch(() => {
    const error = new Error('Local proof storage failed');
    error.name = 'ProofDraftStorageError';
    throw error;
  });
  writes = result.catch(() => {});
  return result;
};
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("proofs", {keyPath: "key"});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Draft storage is blocked"));
  }).catch(error => { database = null; throw error; });
  return database;
}
async function operation(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("proofs", mode);
    const request = callback(transaction.objectStore("proofs"));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error("Draft storage failed"));
  });
}
export const saveProofDraft = (owner, scope, draft) => enqueue(async () => {
  if (!owner || !scope || !(draft.blob instanceof Blob)) throw new Error("Draft identity or bytes missing");
  const {url, thumbnailUrl, blob, ...stored} = draft;
  const fileBytes = await blob.arrayBuffer();
  await operation("readwrite", store => store.put({key:[owner,scope,draft.id],owner,scope,...stored,
    fileBytes, fileType: blob.type,
    thumbnailUrl: thumbnailUrl?.startsWith("blob:") ? null : thumbnailUrl}));
  // A declined persistence request does not invalidate the completed write.
  void globalThis.navigator?.storage?.persist?.().catch(() => {});
});
export async function loadProofDrafts(owner, scope) {
  await writes;
  const rows = await operation("readonly", store => store.getAll(IDBKeyRange.bound([owner,scope], [owner,scope,[]])));
  return rows.filter(row => row.owner === owner && row.scope === scope).map(row => {
    const {key, owner: ignoredOwner, scope: ignoredScope, fileBytes, fileType, ...draft} = row;
    if (fileBytes) draft.blob = new Blob([fileBytes], {type: fileType || draft.mimeType});
    return {...draft,url:URL.createObjectURL(draft.blob)};
  });
}
export const removeProofDraft = (owner, scope, id) => enqueue(async () => {
  await operation("readwrite", store => store.delete([owner,scope,id]));
});
export const clearProofDrafts = (owner, scope) => enqueue(async () => {
  const range = scope === undefined ? IDBKeyRange.bound([owner], [owner,[]]) : IDBKeyRange.bound([owner,scope], [owner,scope,[]]);
  const rows = await operation("readonly", store => store.getAll(range));
  await operation("readwrite", store => {
    for (const row of rows) if (row.owner === owner && (scope === undefined || row.scope === scope)) store.delete(row.key);
  });
});
