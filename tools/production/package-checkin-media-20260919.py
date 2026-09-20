from pathlib import Path
import tarfile,shutil,json,hashlib
root=Path.cwd();candidate=root/'.local/checkin-media-candidate';source=root/'BNBU-Sports-Web-new/frontend/student'
with tarfile.open(root/'.local/checkin-media-baseline-20260919.tar.gz') as t:t.extractall(candidate,filter='data')
def part(s,a,b):return s[s.index(a):s.index(b,s.index(a))]
api=(candidate/'student/js/api.js').read_text(encoding='utf-8');new=(source/'js/api.js').read_text(encoding='utf-8')
a='export async function uploadMediaDraft(';b='/** Uploads one proof into an owned exemption draft;'
api=api.replace(part(api,a,b),part(new,'export async function reconcileRecordDraftMedia(',b),1)
api=api.replace('凭证尚未处理完成，请稍后再提交。','本机凭证与服务器记录不一致，请重试以恢复已上传凭证。').replace('The proof is still processing. Try submitting again shortly.','Local proof differs from the server record. Retry to recover uploaded proof.')
(candidate/'student/js/api.js').write_text(api,encoding='utf-8',newline='\n')
screen=(candidate/'student/js/screens/checkin.js').read_text(encoding='utf-8');new=(source/'js/screens/checkin.js').read_text(encoding='utf-8')
screen=screen.replace('  uploadMediaDraft, cacheRecordProofs,','  uploadMediaDraft, reconcileRecordDraftMedia, cacheRecordProofs,',1)
for a,b in [('async function submitCheckInApi(', '// 1 Hz heartbeat'),('export function isRetainedEvidenceLocked(', 'export function retainedEvidenceStatus('),('  "checkin.previewDraft":','  "checkin.closeDraftPreview":')]:screen=screen.replace(part(screen,a,b),part(new,a,b),1)
screen=screen.replace('<img src="${esc(draft.url)}" alt="">','${draft.url ? `<img src="${esc(draft.url)}" alt="">` : `<span class="proof-card-video-placeholder">${icon("camera-alt", 32)}</span>`}')
screen=screen.replace('点击某项凭证可预览；正式提交开始前，可以删除不合适的照片或视频。','点击凭证可预览；尚未开始上传的本机素材可以删除，已上传凭证会保留。').replace('Open an evidence item to preview it. Before formal submission starts, you can delete an unsuitable photo or video.','Open proof to preview it. Local items can be deleted before uploading; uploaded proof is retained.')
(candidate/'student/js/screens/checkin.js').write_text(screen,encoding='utf-8',newline='\n')
for name in ['checkin-media-reconcile.test.mjs','media-upload-recovery.test.mjs'] :shutil.copyfile(source/name,candidate/'student'/name)
old=(root/'.local/checkin-media-record-service.before.js').read_text(encoding='utf-8-sig');compiled=(root/'backend/dist/modules/exercise-records/application/exercise-records.service.js').read_text(encoding='utf-8')
a='    async getEvidenceContext(';b='    async create('
patched=old.replace(part(old,a,b),part(compiled,a,b),1)
patched=patched.replace('//# sourceMappingURL=exercise-records.service.js.map','// Production baseline with scoped evidence-context recovery overlay.')
(root/'evidence/checkin-media-20260919/exercise-records.service.js').write_text(patched,encoding='utf-8',newline='\n')
print('Candidate uses current production files plus scoped recovery changes.')
