import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runCommand } from './evidence-lib.mjs';

const dotnet = fs.existsSync(`${process.env.HOME}/.dotnet/dotnet`) ? `${process.env.HOME}/.dotnet/dotnet` : 'dotnet';
const checks = [
  ['AUTO-FRONTEND', 'npm', ['--prefix', 'apps/web', 'run', 'verify']],
  ['AUTO-BACKEND', 'node', ['scripts/backend-verify.mjs']],
  ['AUTO-EXPORT', 'npm', ['--prefix', 'apps/web', 'test']],
  ['AUTO-AUDIT', 'node', ['scripts/supply-chain.mjs']],
  ['AUTO-SECRET', 'node', ['scripts/security-scan.mjs']],
  ['AUTO-LEDGER', 'node', ['--test', 'tests/standards/ledger.test.mjs']],
];
process.env.DOTNET_EXE = dotnet;
let failed = 0;
for (const [id, command, args] of checks) {
  if (id === 'AUTO-LEDGER') {
    // The previous self-check remains in its immutable run manifest. Retire it
    // from the latest index before checking the newly executed source snapshot.
    if (fs.existsSync('evidence/index.json')) {
      const current = JSON.parse(fs.readFileSync('evidence/index.json', 'utf8'));
      fs.writeFileSync('evidence/index.json', JSON.stringify(current.filter((e) => e.test_id !== 'AUTO-LEDGER'), null, 2) + '\n');
    }
    const update = spawnSync('python3', ['scripts/build-standards.py'], { stdio: 'ignore' });
    if (update.status !== 0) { failed += 1; continue; }
  }
  console.log(`\n검사 ${id}`);
  failed += (await runCommand(id, command, args)) !== 0 ? 1 : 0;
}
const refresh = spawnSync('python3', ['scripts/build-standards.py'], { stdio: 'ignore' });
if (refresh.status !== 0) failed += 1;
console.log(`실패 검사 ${failed}`);
if (failed) process.exitCode = 1;
