import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const readJson = (file, fallback = []) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
export const commit = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

export function sourceSnapshot() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  return Object.fromEntries(files.filter((f) => (/^(apps\/(web\/(src|[^/]+\.(json|js|ts|html))|api)|packages\/ui|tests|scripts|standards\/profiles)\//.test(f) || /^apps\/web\/[^/]+\.(json|js|ts|html)$/.test(f) || ['package.json', 'package-lock.json', 'global.json', 'dotnet-tools.json', '.editorconfig', '.github/workflows/verify.yml', 'reference-package/standards_catalog.json'].includes(f)) && !f.endsWith('.log') && fs.existsSync(f) && fs.statSync(f).isFile()).map((f) => [f, hash(fs.readFileSync(f))]));
}

export function recordArtifact({ testId, artifactPath, result, observed, command, exitCode = 0, toolName = 'Node.js', toolVersion = process.version, ruleIds = [], limitations = '', sourceHashes, runId }) {
  const collectedAt = new Date().toISOString();
  const id = runId ?? collectedAt.replaceAll(/[:.]/g, '-');
  const item = {
    evidence_id: `${testId}-${id}`, rule_ids: ruleIds.length ? ruleIds : (readJson('standards/tests.json').find((t) => t.test_id === testId)?.rule_ids ?? []), test_id: testId, run_id: id,
    commit_sha: commit(), collected_at: collectedAt,
    environment: `${process.platform}/${process.arch}; Node ${process.version}; 로컬 개발환경`,
    browser_or_assistive_technology: toolName.includes('Chromium') ? toolName : '해당없음 (화면낭독기 평가 아님)',
    tool_name: toolName, tool_version: toolVersion, command, exit_code: exitCode,
    artifact_path: artifactPath, sha256: hash(fs.readFileSync(artifactPath)), result,
    observed, expected: '기록된 assertion 또는 명령의 검사 범위 통과', limitations,
    source_hashes: sourceHashes ?? sourceSnapshot(),
  };
  fs.mkdirSync('evidence', { recursive: true });
  const entries = readJson('evidence/index.json');
  const previous = entries.find((e) => e.test_id === testId);
  if (previous) item.supersedes = previous.evidence_id;
  const next = entries.filter((e) => e.test_id !== testId).concat(item);
  fs.writeFileSync('evidence/index.json', JSON.stringify(next, null, 2) + '\n');
  fs.mkdirSync(`evidence/${id}`, { recursive: true });
  fs.writeFileSync(`evidence/${id}/${testId}.manifest.json`, JSON.stringify(item, null, 2) + '\n');
  return item;
}

export async function runCommand(testId, executable, args, options = {}) {
  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const dir = `evidence/${runId}`;
  fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/${testId}.log`;
  const snapshot = sourceSnapshot();
  let output = '';
  const code = await new Promise((resolve) => {
    const child = spawn(executable, args, { cwd: options.cwd ?? root, env: process.env });
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on('error', (error) => { output += String(error); resolve(127); });
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
  });
  fs.writeFileSync(file, output);
  recordArtifact({ testId, artifactPath: file, result: code === 0 ? '통과' : '실패', observed: `실제 종료코드 ${code}. ${options.scope ?? '명령의 출력 로그 참조'}`, command: [executable, ...args].join(' '), exitCode: code, sourceHashes: snapshot, runId, limitations: options.limitations ?? '외부표준 전체 준수 또는 수동검토 결과를 의미하지 않음' });
  return code;
}
