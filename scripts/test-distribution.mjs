import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { recordArtifact, sourceSnapshot } from './evidence-lib.mjs';

const sourceHashes = sourceSnapshot();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcore-distribution-'));
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const directory = `evidence/${runId}`;
fs.mkdirSync(directory, { recursive: true });
const base = 'http://127.0.0.1:18002';
const executable = fs.existsSync(`${process.env.HOME}/.dotnet/dotnet`) ? `${process.env.HOME}/.dotnet/dotnet` : 'dotnet';
let logs = '';
let server;
let browser;
const observations = [];
let result = '통과';
let failure = '';
try {
  const assembly = path.resolve('artifacts/api/Kstd.Api.dll');
  assert(fs.existsSync(assembly), 'npm run publish:local이 필요합니다.');
  const leak = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? leak(path.join(dir, entry.name)) : [path.join(dir, entry.name)]).filter((name) => /(?:\.db(?:-wal|-shm)?$|[/\\]\.env$|[/\\]key-[^/]+\.xml$)/u.test(name));
  assert.deepEqual(leak('artifacts/api'), [], '배포물에 실제DB/인증키/비밀.env가 포함되면 안 됩니다.');
  server = spawn(executable, [assembly, '--contentRoot', path.resolve('artifacts/api')], { env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', ASPNETCORE_URLS: base, SAMPLE_SEED: 'false', KSTD_DATA_DIR: scratch }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (value) => { logs += value; });
  server.stderr.on('data', (value) => { logs += value; });
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch { ready = false; }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(ready, '독립 배포서버 health 실패');
  const response = await fetch(`${base}/help`);
  assert(response.ok && (await response.text()).includes('root'));
  assert((response.headers.get('content-security-policy') ?? '').includes("script-src 'self'"));
  assert.equal((await fetch(`${base}/api/does-not-exist`)).status, 404);
  for (const name of ['Company_SW_Standards_Register.xlsx', 'Company_SW_Standards_Application_Report.pptx']) {
    const file = await fetch(`${base}/reports/${name}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert(file.ok && bytes.subarray(0, 2).toString() === 'PK');
    observations.push({ file: name, bytes: bytes.length, contentType: file.headers.get('content-type') });
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const scriptErrors = [];
  page.on('pageerror', (error) => scriptErrors.push(error.message));
  await page.goto(`${base}/reports/index.html`);
  await page.getByRole('searchbox').fill('MDR-000');
  assert.equal(await page.locator('article.rule:visible').count(), 1);
  await page.getByRole('button', { name: 'MDR-000 항목 복사', exact: true }).click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes('MDR-000'));
  assert.deepEqual(scriptErrors, []);
  observations.push({ reportSearch: 'MDR-000 = 1개', clipboardReadback: true, scriptErrors, browser: browser.version() });
} catch (error) {
  result = '실패';
  failure = error.stack;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  fs.writeFileSync(`${directory}/distribution-server.log`, logs);
  fs.rmSync(scratch, { recursive: true, force: true });
}
const artifactPath = `${directory}/distribution.json`;
fs.writeFileSync(artifactPath, JSON.stringify({ result, observations, failure, limitation: '독립 Release배포물의 로컬 HTTP/Development smoke검사. 실제운영TLS·인프라 배포검사 아님.' }, null, 2));
recordArtifact({ testId: 'AUTO-DISTRIBUTION', artifactPath, result, observed: JSON.stringify({ observations, failure }), command: 'node scripts/test-distribution.mjs', exitCode: result === '통과' ? 0 : 1, sourceHashes, runId, toolName: 'Release .NET10 / Playwright Chromium', toolVersion: 'SDK10.0.402 / Playwright1.64.1', limitations: '실제 외부배포/TLS 인수 미실행. 로컬 독립배포파일과 다운로드/CSP/보고서기능만 검증.' });
console.log(JSON.stringify({ result, observations, failure }, null, 2));
if (result === '실패') process.exitCode = 1;
