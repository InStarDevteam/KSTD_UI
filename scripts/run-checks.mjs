import fs from 'node:fs';
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
  console.log(`\n검사 ${id}`);
  failed += (await runCommand(id, command, args)) !== 0 ? 1 : 0;
}
console.log(`실패 검사 ${failed}`);
if (failed) process.exitCode = 1;
