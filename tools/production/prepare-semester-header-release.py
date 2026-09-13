"""Package the validated portal build with an exact manifest and rollback deployer."""
from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[2]
work=root/'.local/semester-header-release'
assert not work.exists()
work.mkdir()
shutil.copytree(root/'.local/portal-own-password-build/dist',work/'dist')
script=(root/'tools/production/deploy-invite-ui-final.py').read_text(encoding='utf-8')
script=script.replace("work = Path('/home/ubuntu/bnbu-invite-ui-final-20260913')", "work = Path('/home/ubuntu/bnbu-semester-header-20260913')")
script=script.replace("previous = base / 'releases/invite-brand-20260913'", "previous = base / 'releases/public-note-locale-20260913'")
script=script.replace("release = base / 'releases/invite-ui-final-20260913'", "release = base / 'releases/semester-header-20260913'")
script=script.replace("tag = 'bnbu-portal-production:invite-ui-final-20260913'", "tag = 'bnbu-portal-production:semester-header-20260913'")
script=script.replace("'bnbu-portal-production:invite-brand-20260913'", "'bnbu-portal-production:invite-ui-final-20260913'")
script=script.replace("'focusedTests': '43/43'", "'focusedTests': '12/12'")
start=script.index("assert gate['changedSourceFiles']")
end=script.index('\n',start)
script=script[:start]+"assert gate['changedSourceFiles'] == ['app/admin-semesters.tsx', 'app/admin-workspace.tsx']"+script[end:]
script=script.replace('PORTAL_FEEDBACK_LABELS_DEPLOYMENT','SEMESTER_HEADER_DEPLOYMENT')
(root/'tools/production/deploy-semester-header.py').write_text(script,encoding='utf-8')
(work/'deploy-semester-header.py').write_text(script,encoding='utf-8')
(work/'Dockerfile').write_text('FROM bnbu-portal-production:invite-ui-final-20260913\nUSER root\nRUN rm -rf /app/dist\nCOPY --chown=10001:10001 dist/ /app/dist/\nUSER 10001:10001\n')
gate={'baseSource':'a46fbe41f44b0724c00ee6d91944f5fdfc58cdf0','baseImage':'sha256:69c42e30e571a3af217b1b733d258be611a841744b254e0d454a2ea34f546e10','checks':{'build':'PASS','focusedTests':'12/12'},'patches':['semester-header-sync'],'changedSourceFiles':['app/admin-semesters.tsx','app/admin-workspace.tsx']}
gate['sourceHashes']={name:hashlib.sha256((root/'BNBU-Sports-Web-new/portal-teacher-admin'/name).read_bytes()).hexdigest() for name in gate['changedSourceFiles']}
gate['files']={p.relative_to(work).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in work.rglob('*') if p.is_file()}
(work/'validation.json').write_text(json.dumps(gate,indent=2)+'\n')
