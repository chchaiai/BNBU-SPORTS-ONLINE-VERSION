"""Extract only the create-only fixture function; exclude test reset and fixed credentials."""
from pathlib import Path
import hashlib,json,re,subprocess
root=Path(__file__).resolve().parents[2]
source=root/'backend/test/helpers/database.ts'
text=source.read_text(encoding='utf-8')
marker='export async function seedFoundationFixture('
assert text.count(marker)==1
body=marker+text.split(marker,1)[1]
assert not re.search(r'\b(TRUNCATE|DELETE|DROP|resetFoundationDatabase|executeRaw|deleteMany|updateMany|upsert)\b',body)
assert set(re.findall(r'transaction\.\w+\.(\w+)\(',body))=={'create','createMany'}
body=body.replace("namespace = ''", 'namespace: string, password: string').replace('hash(TEST_PASSWORD,','hash(password,')
assert 'TEST_PASSWORD' not in body
header="import { argon2id, hash } from 'argon2';\nimport { v7 as uuidv7 } from 'uuid';\n"
target=root/'.local/semester-create-only.ts'
target.write_text(header+body,encoding='utf-8')
result={'result':'PREPARED_ONLY','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'helperSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'scope':'Create-only fixture helper; caller must supply unique namespace and random password. No execution against any database.'}
(root/'evidence/ocr-triplatform-20260913/semester-fixture-helper-preparation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
