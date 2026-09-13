"""Export a reviewable Android reference pack from an authoritative checkout.

Usage: python docs/android-student/export-handoff.py SOURCE_CHECKOUT
No network calls, credentials, backend implementation or deployment files copied.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

source = Path(sys.argv[1]).resolve()
target = Path(__file__).resolve().parent
def digest(data):
    return hashlib.sha256(data).hexdigest()
def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

raw = (source / 'backend/src/generated/openapi.document.generated.json').read_bytes()
document = json.loads(raw)
yaml_hash = digest((source / 'docs/backend-contracts/openapi.yaml').read_bytes())
generated_manifest = json.loads((source / 'backend/src/generated/openapi.manifest.generated.json').read_bytes())
assert generated_manifest['sha256'] == yaml_hash, 'Run upstream openapi:check first'
public_ids = {
    'getSystemMode', 'refreshSession', 'previewCourseInvite', 'issueJoinCapability',
    'joinClassSectionWithInvite', 'requestStudentSignInCode', 'verifyStudentSignInCode',
    'requestAccountRecovery', 'completeAccountRecovery', 'listHelpArticles',
    'getHelpArticle', 'getAppReleasePolicy', 'getV81MaintenanceAnnouncement',
}
methods = {'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'}
excluded_ids = {
    'registerPushDevice', 'unregisterPushDevice',
    'startExerciseLocationTrack', 'appendExerciseLocationSamples', 'finalizeExerciseLocationTrack',
    'getExerciseRecordLocationSummary', 'getLocationPrivacyPolicy',
    'requestCurrentUserAccountDeletionChallenge',
    'withdrawEnrollment', 'withdrawExerciseRecord',
}
selected = {}
operations = []
for route, item in document['paths'].items():
    kept = {k: v for k, v in item.items() if k not in methods}
    for method in sorted(methods):
        operation = item.get(method)
        if not operation:
            continue
        policy = operation.get('x-access-policy', {})
        if operation['operationId'] not in excluded_ids and ('STUDENT' in policy.get('allowedRoles', []) or operation['operationId'] in public_ids):
            kept[method] = operation
            operations.append((route, method, operation['operationId'], policy['authentication']))
    if any(k in methods for k in kept):
        selected[route] = kept

subset = {k: v for k, v in document.items() if k not in {'paths', 'components', 'tags'}}
subset['paths'] = selected
subset['components'] = {}
subset['x-android-handoff'] = {'sourceSha256': yaml_hash, 'status': 'DERIVED_LOCAL_DRAFT_NOT_A_RELEASE',
    'selection': 'STUDENT allowedRoles plus explicit public authentication, invite, help and system operations; excluded legacy location, push, self-deletion and withdrawal; role access is not feature availability',
    'excludedOperationIds': sorted(excluded_ids)}
def resolve(pointer):
    value = document
    for part in pointer.removeprefix('#/').split('/'):
        value = value[part.replace('~1', '/').replace('~0', '~')]
    return value
seen = set()
def collect(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == '$ref':
                assert child.startswith('#/components/'), child
                if child not in seen:
                    seen.add(child)
                    _, _, category, name = child.split('/')
                    resolved = resolve(child)
                    subset['components'].setdefault(category, {})[name] = resolved
                    collect(resolved)
            elif key == 'security':
                for requirement in child:
                    for name in requirement:
                        ref = '#/components/securitySchemes/' + name
                        subset['components'].setdefault('securitySchemes', {})[name] = resolve(ref)
            else:
                collect(child)
    elif isinstance(value, list):
        for child in value:
            collect(child)
collect({k: v for k, v in subset.items() if k != 'components'})
used_tags = {tag for item in selected.values() for method, op in item.items() if method in methods for tag in op.get('tags', [])}
subset['tags'] = [tag for tag in document.get('tags', []) if tag['name'] in used_tags]
write_json(target / 'api/openapi.student.json', subset)
index = '# 学生接口索引\n\n由当前接口定义按学生权限筛选；接口存在不表示功能已开放。请同时阅读入口说明。\n\n| Method | Path（Base URL 已含 /api/v1） | operationId | Authentication |\n| --- | --- | --- | --- |\n'
for route, method, name, auth in sorted(operations):
    index += f'| {method.upper()} | `{route}` | `{name}` | {auth} |\n'
(target / 'api/operations.md').write_text(index, encoding='utf-8')

copies = {
    'docs/business/00-overview.md': 'business/00-overview.md',
    'docs/business/10-student-flow.md': 'business/10-student-flow.md',
}
for name in ['api.js', 'session.js', 'proofs.js', 'v81-review.js', 'application-draft-store.js',
             'checkin-drafts.js', 'photo-originals.js', 'recorded-video.js', 'material-files.js',
             'sports-catalog.js', 'student-regions.js']:
    copies['BNBU-Sports-Web-new/frontend/student/js/' + name] = 'reference/' + name
files = []
for origin, destination in copies.items():
    data = (source / origin).read_bytes()
    out = target / destination
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    files.append({'path': destination, 'source': origin, 'sha256': digest(data)})
checkin = (source / 'BNBU-Sports-Web-new/frontend/student/js/screens/checkin.js').read_text(encoding='utf-8')
start = checkin.index('async function transitionLiveSession(')
end = checkin.index('\nfunction stopLiveCamera(', start)
excerpt = '# 暂停与继续参考\n\n原 Web 函数摘录，仅供移植状态处理；依赖 Web 上下文，不能单独运行。\n\n```javascript\n' + checkin[start:end].rstrip() + '\n```\n'
(target / 'reference/session-transition.md').write_text(excerpt, encoding='utf-8')
for relative in ['api/openapi.student.json', 'api/operations.md', 'reference/session-transition.md']:
    files.append({'path': relative, 'sha256': digest((target / relative).read_bytes()), 'derived': True})
write_json(target / 'source-manifest.json', {
    'sourceCommit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(),
    'sourceOpenapiSha256': yaml_hash, 'sourceGeneratedJsonSha256': digest(raw),
    'apiVersion': document['info']['version'], 'status': 'DERIVED_LOCAL_DRAFT_NOT_A_RELEASE',
    'operationCount': len(operations), 'files': files,
})
print(f'Exported {len(operations)} operations, {len(seen)} referenced components and {len(files)} files')
