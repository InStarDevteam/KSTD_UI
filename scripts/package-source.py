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
print(f'{output.relative_to(root)} ({output.stat().st_size:,} bytes), .env/DB/keys/node_modules/bin/obj 제외')
