"""Build a source-only local handoff. Never uploads or deploys anything."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = root.parent / f'暖心护-家庭协作版-{version}-开发版.zip'
root_files = {'README.md', 'package.json', 'package-lock.json', 'project.config.json',
              '.editorconfig', '.prettierrc.json', '.prettierignore'}
directories = {'miniprogram', 'cloudfunctions', 'deployment', 'docs', 'tests', 'scripts'}
suffixes = {'.js', '.cjs', '.json', '.wxml', '.wxss', '.png', '.mp3', '.md', '.py', '.txt'}
excluded = {'node_modules', 'artifacts', '.git', '__pycache__'}
manifest = {}
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        if not file.is_file():
            continue
        rel = file.relative_to(root)
        if any(p in excluded for p in rel.parts):
            continue
        if (file.name.startswith('.env') or '.private.' in file.name
                or file.name.endswith('.local.json')):
            continue
        if not (rel.as_posix() in root_files or
                (rel.parts[0] in directories and file.suffix in suffixes)):
            continue
        name = (Path('nuanxinhu') / rel).as_posix()
        data = file.read_bytes()
        archive.writestr(name, data)
        manifest[name] = hashlib.sha256(data).hexdigest()
    archive.writestr('SOURCE-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with ZipFile(target) as archive:
    assert archive.testzip() is None
    config = json.loads(archive.read('nuanxinhu/project.config.json'))
    assert 'nuanxinhu/' + config['miniprogramRoot'] + 'app.json' in archive.namelist()
    assert 'nuanxinhu/cloudfunctions/warmcare/package-lock.json' in archive.namelist()
    for name, digest in manifest.items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest
print(json.dumps({'path': str(target), 'files': len(manifest),
                  'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, ensure_ascii=False))
