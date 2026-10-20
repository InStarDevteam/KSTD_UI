import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { hash, readJson } from './evidence-lib.mjs';

/** Validate the evidence chain; partial assertions cannot create a full PASS. */
export function validateEvidence(catalog, records, tests, evidence, { checkFiles = true } = {}) {
  const errors = [];
  const rules = new Map(catalog.rules.map((r) => [r.rule_id, r]));
  const testIds = new Set(tests.map((t) => t.test_id));
  const evidenceById = new Map(evidence.map((e) => [e.evidence_id, e]));
  if (rules.size !== catalog.rules.length) errors.push('중복 표준 ID');
  if (new Set(records.map((r) => r.rule_id)).size !== records.length) errors.push('중복 적용 ID');
  if (testIds.size !== tests.length) errors.push('중복 시험 ID');
  if (records.length !== rules.size) errors.push('원장 행수 불일치');
  for (const r of records) {
    const rule = rules.get(r.rule_id);
    if (!rule) { errors.push(`${r.rule_id}: 정의 없음`); continue; }
    if (!r.test_refs.length) errors.push(`${r.rule_id}: 시험 미연결`);
    if (r.test_refs.some((id) => !testIds.has(id))) errors.push(`${r.rule_id}: 시험ID 미존재`);
    if (r.evidence_ids.some((id) => !evidenceById.has(id))) errors.push(`${r.rule_id}: 증빙ID 미존재`);
    if (r.evidence_ids.some((id) => evidenceById.has(id) && !r.test_refs.includes(evidenceById.get(id).test_id))) errors.push(`${r.rule_id}: 시험과 증빙 연결 불일치`);
    if (r.applicability === '해당없음' && (!r.applicability_reason || !r.trigger_condition)) errors.push(`${r.rule_id}: 해당없음 사유/재평가 없음`);
    if (checkFiles) for (const ref of r.code_refs) {
      const [file, symbol] = ref.split('#');
      if (!fs.existsSync(file)) errors.push(`${r.rule_id}: 코드경로 없음 ${ref}`);
      else if (symbol && !fs.readFileSync(file, 'utf8').includes(symbol.split('.').at(-1))) errors.push(`${r.rule_id}: 심볼/앵커 없음 ${ref}`);
    }
    if (r.final_result === '통과') {
      const autoNeeded = rule.required_verification.includes('자동');
      const manualNeeded = rule.required_verification.includes('수동');
      if (r.implementation_status !== '구현' || !r.code_refs.length || !r.test_refs.length || !r.evidence_ids.length || !r.reviewer || !r.reviewed_at || r.deviation_id || r.company_deviation || (autoNeeded && r.auto_result !== '통과') || (manualNeeded && r.manual_result !== '통과')) errors.push(`${r.rule_id}: 근거 없는 PASS`);
      if (r.evidence_ids.some((id) => evidenceById.get(id)?.result !== '통과')) errors.push(`${r.rule_id}: 실패/미실행 증빙으로 PASS`);
    }
    if (r.rule_id === 'MDR-000' && (r.applicability !== '확인필요' || r.final_result === '통과')) errors.push('MDR 미확정 상태 훼손');
  }
  for (const e of evidence) {
    for (const key of ['evidence_id', 'test_id', 'run_id', 'commit_sha', 'collected_at', 'environment', 'tool_name', 'tool_version', 'command', 'artifact_path', 'sha256', 'result']) if (!e[key]) errors.push(`${e.evidence_id}: ${key} 누락`);
    if (e.result === '통과' && e.exit_code !== 0) errors.push(`${e.evidence_id}: 종료코드 불일치`);
    if (checkFiles) {
      if (!fs.existsSync(e.artifact_path)) errors.push(`${e.evidence_id}: 파일 없음`);
      else if (hash(fs.readFileSync(e.artifact_path)) !== e.sha256) errors.push(`${e.evidence_id}: hash 불일치`);
      try { execFileSync('git', ['cat-file', '-e', `${e.commit_sha}^{commit}`], { stdio: 'ignore' }); } catch { errors.push(`${e.evidence_id}: commit 미존재`); }
      for (const [file, digest] of Object.entries(e.source_hashes ?? {})) {
        if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== digest) errors.push(`${e.evidence_id}: 시험후 소스변경 ${file}`);
      }
    }
  }
  const deviations = readJson('standards/deviations.json');
  for (const d of deviations) {
    if (!d.deviation_id || !d.reason || !d.approver || !d.expires_at || !Array.isArray(d.rule_ids)) errors.push('편차 필수필드 누락');
    if (d.expires_at && new Date(d.expires_at) < new Date()) errors.push(`${d.deviation_id}: 편차 만료`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateEvidence(readJson('standards/catalog.json', {}), readJson('standards/application-records.json'), readJson('standards/tests.json'), readJson('evidence/index.json'));
  console.log(JSON.stringify({ result: errors.length ? '실패' : '통과', errors, scope: '원장·시험연결·경로·SHA256·commit·시험시점 소스·허위 PASS 차단' }, null, 2));
  if (errors.length) process.exitCode = 1;
}
