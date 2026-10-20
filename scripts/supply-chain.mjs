import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const inventories = [];
let failed = false;
fs.mkdirSync('evidence/supply-chain', { recursive: true });
for (const [label, cwd] of [['tools', '.'], ['web', 'apps/web']]) {
  const audit = spawnSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8' });
  fs.writeFileSync(`evidence/supply-chain/npm-audit-${label}.json`, audit.stdout || JSON.stringify({ error: audit.stderr }));
  if (audit.status !== 0) failed = true;
  const sbom = spawnSync('npm', ['sbom', '--sbom-format', 'cyclonedx'], { cwd, encoding: 'utf8' });
  fs.writeFileSync(`evidence/supply-chain/sbom-${label}.cyclonedx.json`, sbom.stdout || JSON.stringify({ error: sbom.stderr }));
  if (sbom.status !== 0) failed = true;
  const lock = JSON.parse(fs.readFileSync(`${cwd}/package-lock.json`, 'utf8'));
  for (const [name, data] of Object.entries(lock.packages ?? {})) {
    inventories.push({ ecosystem: 'npm', scope: label, path: name || '.', version: data.version ?? '', license: data.license ?? '미확인', integrity: data.integrity ?? '', resolved: data.resolved ?? '' });
  }
}
const lock = JSON.parse(fs.readFileSync('apps/api/packages.lock.json', 'utf8'));
for (const [framework, packages] of Object.entries(lock.dependencies)) {
  for (const [name, data] of Object.entries(packages)) inventories.push({ ecosystem: 'NuGet', framework, name, version: data.resolved, integrity: data.contentHash, license: 'NuGet 개별 라이선스 원문 검토 필요' });
}
fs.writeFileSync('evidence/supply-chain/dependencies.json', JSON.stringify({ generated_at: new Date().toISOString(), format: 'dependency inventory (SPDX/CycloneDX 인증 SBOM 아님)', components: inventories }, null, 2));
const dotnet = process.env.DOTNET_EXE ?? `${process.env.HOME}/.dotnet/dotnet`;
const nuget = spawnSync(dotnet, ['list', 'apps/api/Kstd.Api.csproj', 'package', '--vulnerable', '--include-transitive', '--format', 'json'], { encoding: 'utf8' });
fs.writeFileSync('evidence/supply-chain/nuget-audit.json', nuget.stdout || JSON.stringify({ error: nuget.stderr }));
if (nuget.status !== 0) failed = true;
try {
  const data = JSON.parse(nuget.stdout);
  if (data.projects?.some((p) => p.frameworks?.some((f) => [...(f.topLevelPackages ?? []), ...(f.transitivePackages ?? [])].some((pkg) => pkg.vulnerabilities?.length)))) failed = true;
} catch { failed = true; }
console.log(`npm/NuGet 실제 취약점 조회, 의존성 ${inventories.length}개 목록. 라이선스 법적 검토는 미실행.`);
if (failed) process.exitCode = 1;
