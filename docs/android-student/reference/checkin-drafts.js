// Durable proof bytes, scoped to the signed-in student and exercise/supplement.
// Blob URLs are document-local and must be rebuilt after a page restart.
const DB_NAME = "bnbu.student.web.checkin-drafts";
let database;
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
export async function saveProofDraft(owner, scope, draft) {
  if (!owner || !scope || !(draft.blob instanceof Blob)) throw new Error("Draft identity or bytes missing");
  const {url, thumbnailUrl, ...stored} = draft;
  await operation("readwrite", store => store.put({key:[owner,scope,draft.id],owner,scope,...stored,
    thumbnailUrl: thumbnailUrl?.startsWith("blob:") ? null : thumbnailUrl}));
  // A declined persistence request does not invalidate the completed write.
  void globalThis.navigator?.storage?.persist?.().catch(() => {});
}
export async function loadProofDrafts(owner, scope) {
  const rows = await operation("readonly", store => store.getAll(IDBKeyRange.bound([owner,scope], [owner,scope,[]])));
  return rows.filter(row => row.owner === owner && row.scope === scope).map(row => {
    const {key, owner: ignoredOwner, scope: ignoredScope, ...draft} = row;
    return {...draft,url:URL.createObjectURL(draft.blob)};
  });
}
export async function removeProofDraft(owner, scope, id) {
  await operation("readwrite", store => store.delete([owner,scope,id]));
}
export async function clearProofDrafts(owner, scope) {
  const range = scope === undefined ? IDBKeyRange.bound([owner], [owner,[]]) : IDBKeyRange.bound([owner,scope], [owner,scope,[]]);
  const rows = await operation("readonly", store => store.getAll(range));
  await operation("readwrite", store => {
    for (const row of rows) if (row.owner === owner && (scope === undefined || row.scope === scope)) store.delete(row.key);
  });
}
