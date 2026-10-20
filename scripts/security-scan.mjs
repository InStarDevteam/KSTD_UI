import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n').filter((file) => /^(apps\/(web\/src|api)|packages|scripts|\.github)\//.test(file) && /\.(ts|tsx|js|mjs|cs|json|yml)$/.test(file));
const signatures = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['aws-access-key', /AKIA[A-Z0-9]{16}/u],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{30,}/u],
];
const findings = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [pattern, regex] of signatures) if (regex.test(source)) findings.push({ file, pattern });
}
fs.mkdirSync('evidence/security', { recursive: true });
fs.writeFileSync('evidence/security/secret-scan.json', JSON.stringify({ tool: 'repository-secret-signature-check', version: '1.0', files: files.length, findings, limitations: '3종 서명 검사. 전체 비밀탐지·SAST·상용도구 대체 아님. 민감값 원문은 출력하지 않음.' }, null, 2));
console.log(`소스 ${files.length}파일, 비밀서명 ${signatures.length}종, 탐지 ${findings.length}건 (값 비노출)`);
if (findings.length) process.exitCode = 1;
