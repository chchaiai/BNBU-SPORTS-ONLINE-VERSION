from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
def sha(path):
    return hashlib.sha256((root / path).read_bytes()).hexdigest()

result = {
    'observedAt': datetime.now(timezone.utc).isoformat(),
    'release': '/opt/bnbu-sports-production/releases/invite-ui-final-20260913',
    'backendImage': 'sha256:c676a33218fc069cc6c57a14d36a96420bfeb8bb36facb84939cff8826b68055',
    'portalImage': 'sha256:69c42e30e571a3af217b1b733d258be611a841744b254e0d454a2ea34f546e10',
    'officialSources': ['https://bnbusports.cn/favicon.svg', 'https://bnbusports.cn/sports-logo.png'],
    'webIconSha256': sha('.local/bnbu-official-favicon.svg'),
    'androidLogoSha256': sha('.local/bnbu-official-sports-logo.png'),
    'androidApkSha256': sha('.local/retired-android-artifacts-20260913/app/build/outputs/apk/debug/app-debug.apk'),
    'androidPackage': 'cn.bnbusports.student.preview',
    'androidEvidence': 'Pixel_9 API emulator install, launcher icon visible, application opens production privacy entry',
    'androidReleaseSigning': 'NOT_EXECUTED',
    'nativeClientsFinalDisposition': 'Removed at user request after icon verification; historical build retained privately, not distributed',
    'browserInviteInput': {'min': 5, 'max': 120, 'step': 1, 'default': 30},
    'firstFailures': ['Icons metadata object caused 1/43 SSR failure; standard head/link fixed it', 'Browser detected old input max=1440; final deployed max=120 step=1'],
    'checks': {'portalBuild': 'PASS', 'portalFocusedTests': '43/43', 'backendCompile': 'PASS', 'backendUnit': '282/282', 'backendContract': '35/35', 'inviteUnit': '3/3', 'androidBuild': 'PASS', 'cloudRead': '51/51'},
    'evidenceFiles': {},
}
for name in ['invite-brand-portal-build.log', 'invite-brand-portal-tests.log', 'invite-brand-portal-final-build.log', 'invite-brand-portal-final-tests.log', 'invite-brand-android-build.log', 'invite-brand-backend-unit.log', 'invite-brand-backend-contract.log']:
    result['evidenceFiles'][name] = sha('.local/' + name)
for path in ['.local/deployed-portal-icon.svg', '.local/deployed-student-icon.svg']:
    assert sha(path) == result['webIconSha256']
(root / 'evidence/ocr-triplatform-20260913/invite-brand-release.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'result': 'PASS', 'release': result['release']}))
