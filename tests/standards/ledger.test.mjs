import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../../scripts/evidence-check.mjs';
import { readJson } from '../../scripts/evidence-lib.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('297개 전수 시험연결 및 접근성 독립 목록 보존', () => {
  const catalog = readJson('standards/catalog.json');
  assert.equal(catalog.rules.length, 297);
  assert.equal(catalog.rules.filter((r) => r.rule_id.startsWith('KWA-')).length, 33);
  assert.equal(catalog.rules.filter((r) => r.rule_id.startsWith('WCA-')).length, 55);
  assert(!catalog.rules.some((r) => r.rule_id.startsWith('WCA-') && r.source_clause === '4.1.1'));
  const errors = validateEvidence(catalog, readJson('standards/application-records.json'), readJson('standards/tests.json'), readJson('evidence/index.json'), { checkFiles: true });
  assert.deepEqual(errors, []);
});

test('미실행·수동누락·증빙누락·편차·검토누락으로 PASS를 만들 수 없음', () => {
  const definition = { rules: [{ rule_id: 'X-1', required_verification: '자동+수동' }] };
  const base = { rule_id: 'X-1', implementation_status: '구현', applicability: '적용', code_refs: ['exists'], test_refs: ['T1'], evidence_ids: ['E1'], auto_result: '통과', manual_result: '통과', reviewer: '테스트 fixture', reviewed_at: '2026-10-20', final_result: '통과' };
  const ev = [{ evidence_id: 'E1', test_id: 'T1', run_id: 'run', commit_sha: 'fixture', collected_at: 'date', environment: 'fixture', tool_name: 'fixture', tool_version: '1', command: 'fixture', artifact_path: 'fixture', sha256: 'fixture', result: '통과', exit_code: 0 }];
  assert.deepEqual(validateEvidence(definition, [base], [{ test_id: 'T1' }], ev, { checkFiles: false }), []);
  for (const patch of [{ manual_result: '미실행' }, { auto_result: '부분확인' }, { evidence_ids: [] }, { reviewer: '' }, { deviation_id: 'D1' }, { implementation_status: '진행' }]) {
    assert(validateEvidence(definition, [{ ...base, ...patch }], [{ test_id: 'T1' }], ev, { checkFiles: false }).some((e) => e.includes('PASS')));
  }
});

test('해당없음에는 사유·재평가 조건이 필요', () => {
  const errors = validateEvidence({ rules: [{ rule_id: 'X-1' }] }, [{ rule_id: 'X-1', applicability: '해당없음', test_refs: ['T1'], evidence_ids: [], code_refs: [] }], [{ test_id: 'T1' }], [], { checkFiles: false });
  assert(errors.some((e) => e.includes('재평가')));
});

test('실제 파일의 hash변조와 종료코드 불일치 증빙은 거부', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcore-evidence-'));
  try {
    const artifact = path.join(directory, 'actual.log');
    fs.writeFileSync(artifact, 'actual result');
    const evidence = [{ evidence_id: 'E1', test_id: 'T1', run_id: 'fixture', commit_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), collected_at: new Date().toISOString(), environment: 'fixture', tool_name: 'fixture', tool_version: '1', command: 'fixture', artifact_path: artifact, sha256: 'incorrect-hash', result: '통과', exit_code: 7 }];
    const errors = validateEvidence({ rules: [] }, [], [], evidence);
    assert(errors.some((e) => e.includes('hash 불일치')));
    assert(errors.some((e) => e.includes('종료코드 불일치')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
