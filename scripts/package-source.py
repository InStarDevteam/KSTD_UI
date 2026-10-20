"""Package the reproducible sample without credentials, dependencies or live DB."""
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / 'reports/FlowCore_Sample_Source.zip'
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
names += [str(p.relative_to(root)) for p in (root / 'references').glob('*.pdf')]
excluded = ('tmp/', 'artifacts/', 'backups/', 'apps/api/data/', 'reports/previews/')
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name in sorted(set(names)):
        file = root / name
        if not file.is_file() or file == output or name.startswith(excluded) or '.env' == name or '__pycache__/' in name:
            continue
        archive.write(file, 'FlowCore/' + name)
    # Evidence validation requires real commit objects. Preserve this newly
    # created project's history, without remotes, hooks or machine settings.
    for relative in ['HEAD', 'index', 'packed-refs']:
        file = root / '.git' / relative
        if file.is_file():
            archive.write(file, 'FlowCore/.git/' + relative)
    for folder in ['objects', 'refs']:
        for file in (root / '.git' / folder).rglob('*'):
            if file.is_file():
                archive.write(file, 'FlowCore/' + str(file.relative_to(root)))
    archive.writestr('FlowCore/.git/config', '[core]\nrepositoryformatversion = 0\nfilemode = true\nbare = false\nlogallrefupdates = true\n')
print(f'{output.relative_to(root)} ({output.stat().st_size:,} bytes), 증빙용 Git이력 포함; .env/DB/keys/node_modules/bin/obj/remote/hooks 제외')
