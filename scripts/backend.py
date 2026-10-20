#!/usr/bin/env python3
"""API lifecycle commands. Reset/restore require explicit target acknowledgement."""
import argparse
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DOTNET = shutil.which('dotnet') or str(Path.home() / '.dotnet/dotnet')
DATA = Path(os.environ.get('KSTD_DATA_DIR', ROOT / 'apps/api/data')).resolve()
PROJECT = ROOT / 'apps/api/Kstd.Api.csproj'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('command', choices=['restore', 'run', 'migrate', 'reset', 'backup', 'restore-db'])
parser.add_argument('--confirm-target', help='Required for reset/restore: exact absolute data directory printed by the command.')
parser.add_argument('--archive', type=Path, help='Backup output or restore source tar.gz path.')
args = parser.parse_args()


def run(*arguments):
    subprocess.run([DOTNET, *map(str, arguments)], cwd=ROOT, check=True)


if args.command == 'restore':
    run('restore', PROJECT, '--locked-mode')
    run('tool', 'restore')
elif args.command == 'run':
    os.environ.setdefault('ASPNETCORE_ENVIRONMENT', 'Development')
    os.execv(DOTNET, [DOTNET, 'run', '--project', str(PROJECT), '--no-launch-profile'])
elif args.command == 'migrate':
    run('ef', 'database', 'update', '--project', PROJECT)
elif args.command in ['reset', 'restore-db']:
    print(f'Target: {DATA}\nImpact: database, uploads and authentication keys will be replaced. Stop the API first.')
    if args.confirm_target != str(DATA):
        parser.error('Supply --confirm-target with the exact absolute target to acknowledge replacement.')
    if os.environ.get('ASPNETCORE_ENVIRONMENT') == 'Production':
        parser.error('Development reset/restore commands are forbidden in Production.')
    if args.command == 'restore-db':
        if not args.archive or not args.archive.is_file():
            parser.error('--archive must be an existing backup.')
        with tarfile.open(args.archive, 'r:gz') as archive:
            for item in archive.getmembers():
                path = Path(item.name)
                if path.is_absolute() or '..' in path.parts or not (item.isfile() or item.isdir()):
                    parser.error('Unsafe archive member rejected.')
            if DATA.exists():
                shutil.rmtree(DATA)
            DATA.mkdir(parents=True, mode=0o700)
            archive.extractall(DATA)  # Every member validated above; compatible with Python 3.9+.
        if os.name != 'nt':
            os.chmod(DATA, 0o700)
            os.chmod(DATA / 'kstd.db', 0o600)
        print('Restored. Start API and check /api/health and an authorized attachment download.')
    else:
        if DATA.exists():
            shutil.rmtree(DATA)
        print('Development data removed. Next API start applies migrations; seed requires injected passwords.')
elif args.command == 'backup':
    if not (DATA / 'kstd.db').is_file():
        parser.error('No database exists at the target.')
    archive_path = (args.archive or ROOT / f'backups/kstd-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.tar.gz').resolve()
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    # Stop writes during backup so database rows and filesystem attachments form one consistent point in time.
    print('Stop API before backup to maintain database/file consistency.')
    import tempfile
    with tempfile.TemporaryDirectory(prefix='kstd-backup-') as staging:
        stage = Path(staging)
        with sqlite3.connect(DATA / 'kstd.db') as source, sqlite3.connect(stage / 'kstd.db') as target:
            source.backup(target)
        for folder in ['uploads', 'keys']:
            if (DATA / folder).exists():
                shutil.copytree(DATA / folder, stage / folder)
        with tarfile.open(archive_path, 'w:gz') as archive:
            for child in stage.iterdir():
                archive.add(child, arcname=child.name)
    os.chmod(archive_path, 0o600)
    print(f'Backup: {archive_path} (contains authentication keys; restrict access)')
