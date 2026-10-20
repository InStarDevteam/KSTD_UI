import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

process.chdir(path.resolve(import.meta.dirname, '..'));
const dotnet = fs.existsSync(`${process.env.HOME}/.dotnet/dotnet`) ? `${process.env.HOME}/.dotnet/dotnet` : 'dotnet';
const mode = process.argv[2];
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env, ...extra });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === 'setup') {
  if (!fs.existsSync('.env')) {
    fs.writeFileSync('.env', `ASPNETCORE_ENVIRONMENT=Development\nSAMPLE_SEED=true\nSAMPLE_USER_PASSWORD=${randomBytes(18).toString('base64url')}aA1!\nSAMPLE_ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}aA1!\n`, { mode: 0o600 });
    console.log('.env에 개발용 임의 비밀번호를 생성했습니다. 사용자/관리자 비밀번호는 해당 파일에서 확인하세요.');
  }
  process.loadEnvFile('.env');
  run('npm', ['ci']);
  run('npm', ['--prefix', 'apps/web', 'ci']);
  run(dotnet, ['restore', 'apps/api/Kstd.Api.csproj', '--locked-mode']);
  run(dotnet, ['tool', 'restore']);
  run('python3', ['scripts/build-standards.py']);
  run('npx', ['playwright', 'install', 'chromium']);
  console.log('의존성 복원 완료. npm run dev 최초 실행 시 비파괴 migration/개발 seed가 실행됩니다.');
} else if (mode === 'dev') {
  if (!fs.existsSync('.env')) throw new Error('npm run setup을 먼저 실행하세요.');
  process.loadEnvFile('.env');
  for (const port of [8000, 8001]) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', () => reject(new Error(`${port} 포트가 사용 중입니다. 기존 프로세스를 확인 후 종료하세요.`)));
      probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
  }
  const children = [
    spawn(dotnet, ['run', '--project', 'apps/api/Kstd.Api.csproj', '--no-launch-profile', '--urls', 'http://127.0.0.1:8001'], { stdio: 'inherit', env: process.env }),
    spawn('npm', ['--prefix', 'apps/web', 'run', 'dev'], { stdio: 'inherit', env: process.env }),
  ];
  console.log('FlowCore: http://localhost:8000 (API8001). 종료: Ctrl+C.');
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    process.exitCode = code;
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
  for (const child of children) {
    child.on('error', (error) => { console.error(error.message); stop(1); });
    child.on('exit', (code) => stop(code ?? 0));
  }
} else if (mode === 'publish') {
  run('npm', ['--prefix', 'apps/web', 'run', 'build']);
  run(dotnet, ['publish', 'apps/api/Kstd.Api.csproj', '--configuration', 'Release', '--output', 'artifacts/api', '--no-restore']);
  fs.mkdirSync('artifacts/api/wwwroot', { recursive: true });
  fs.cpSync('apps/web/dist', 'artifacts/api/wwwroot', { recursive: true });
  console.log('동일출처 배포 파일 artifacts/api. 운영 HTTPS·DB경로·키저장소/권한/백신은 RUNBOOK 확인. 실제 공개 배포 미수행.');
} else {
  throw new Error('지원 작업: setup, dev, publish');
}
