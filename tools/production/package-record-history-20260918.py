"""Overlay only history-reading changes on the captured production student site."""
from pathlib import Path
import hashlib,json,tarfile,subprocess
root=Path(__file__).resolve().parents[2]
e=root/'evidence/record-history-20260918'
candidate=root/'.local/record-history-candidate'
candidate.mkdir(exist_ok=True)
with tarfile.open(root/'.local/record-history-student-baseline.tar.gz') as tar:
    tar.extractall(candidate,filter='data')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=root/'BNBU-Sports-Web-new/frontend/student'
baseline={name:sha(candidate/'student'/name) for name in ['js/api.js','js/screens/checkin.js']}
def part(text,start,end):return text[text.index(start):text.index(end,text.index(start))]
api=(candidate/'student/js/api.js').read_text(encoding='utf-8')
newapi=(source/'js/api.js').read_text(encoding='utf-8')
assert 'export async function listMyRecordPage' not in api
api=api.replace('export const listMyRecords =',part(newapi,'export async function listMyRecordPage','export const listMyNotificationPage')+'export const listMyRecords =',1)
(candidate/'student/js/api.js').write_text(api,encoding='utf-8',newline='\n')
screen=(candidate/'student/js/screens/checkin.js').read_text(encoding='utf-8')
newscreen=(source/'js/screens/checkin.js').read_text(encoding='utf-8')
screen=screen.replace('  loadServerRecordProofs,','  loadServerRecordProofs,\n  currentApiSessionEpoch, isCurrentApiSessionEpoch, listMyRecordPage, mapSubmittedRecords,',1)
screen=screen.replace(part(screen,'function renderRecordsTab(app)', 'function proofDisplayName'),part(newscreen,'function renderRecordsTab(app)', 'function proofDisplayName'),1)
screen=screen.replace('export const checkinActions = {',part(newscreen,'export async function reloadRecordList','  "checkin.moreRecovery":'),1)
old='    checkinState(app).tab = el.dataset.tab;\n    app.render();'
assert old in screen
screen=screen.replace(old,old+'\n    if (el.dataset.tab === "records") return reloadRecordList(app);',1)
(candidate/'student/js/screens/checkin.js').write_text(screen,encoding='utf-8',newline='\n')
bundle=e/'bundle';bundle.mkdir(exist_ok=True)
files={}
for name in baseline:
    target=bundle/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((candidate/'student'/name).read_bytes());files[name]=sha(target)
gate={'previousRelease':'zero-target-20260918','release':'record-history-20260918','sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'baseline':baseline,'files':files,'scope':'student history reads only; production baseline overlay'}
(e/'manifest.json').write_text(json.dumps(gate,indent=2),encoding='utf-8')
print(json.dumps({'result':'PACKAGED','files':files}))
