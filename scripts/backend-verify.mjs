import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const localDotnet = path.join(homedir(), '.dotnet', 'dotnet');
const dotnet = existsSync(localDotnet) ? localDotnet : 'dotnet';
const output = path.join(root, 'evidence/backend');
mkdirSync(output, { recursive: true });
const tasks = [
  ['restore', dotnet, ['restore', 'tests/backend/Kstd.Api.Tests/Kstd.Api.Tests.csproj', '--locked-mode']],
  ['build', dotnet, ['build', 'tests/backend/Kstd.Api.Tests/Kstd.Api.Tests.csproj', '--no-restore']],
  ['format', dotnet, ['format', 'apps/api/Kstd.Api.csproj', '--verify-no-changes', '--no-restore']],
  ['unit', dotnet, ['test', 'tests/backend/Kstd.Api.Tests/Kstd.Api.Tests.csproj', '--no-build', '--no-restore', '--logger', 'trx;LogFileName=backend-unit.trx', '--results-directory', 'evidence/backend/unit', '--collect:XPlat Code Coverage', '--settings', 'tests/backend/coverage.runsettings']],
  ['integration', 'python3', ['tests/backend/integration.py']],
  ['sbom', 'python3', ['scripts/backend-sbom.py']],
  ['vulnerabilities', dotnet, ['list', 'apps/api/Kstd.Api.csproj', 'package', '--vulnerable', '--include-transitive', '--format', 'json', '--no-restore']],
];
let failed = false;
for (const [name, executable, args] of tasks) {
  const started = new Date().toISOString();
  process.stdout.write(`Backend ${name}: running\n`);
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1' }, maxBuffer: 20 * 1024 * 1024 });
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`;
  writeFileSync(path.join(output, `${name}.log`), log);
  let exitCode = result.status ?? 1;
  if (name === 'vulnerabilities' && exitCode === 0) {
    try {
      const report = JSON.parse(result.stdout);
      const vulnerable = (report.projects ?? []).flatMap((project) => project.frameworks ?? []).flatMap((framework) => [...(framework.topLevelPackages ?? []), ...(framework.transitivePackages ?? [])]).filter((packageInfo) => (packageInfo.vulnerabilities ?? []).length > 0);
      if (vulnerable.length > 0) {
        process.stderr.write(`NuGet reported ${vulnerable.length} vulnerable package records; review required.\n`);
        exitCode = 1;
      }
    } catch {
      process.stderr.write('NuGet vulnerability output was not valid JSON; verification failed.\n');
      exitCode = 1;
    }
  }
  writeFileSync(path.join(output, `${name}-execution.json`), JSON.stringify({ command: [executable, ...args], started, finished: new Date().toISOString(), exit_code: exitCode, result: exitCode === 0 ? '통과' : '실패' }, null, 2));
  process.stdout.write(log);
  if (exitCode !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
