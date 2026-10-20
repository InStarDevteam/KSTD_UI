"""Build the reviewable ledger from immutable definitions and real execution records.

No test or reviewer is inferred from code presence. An executed automated case
can confirm only its recorded scope; required human review remains pending.
"""
from pathlib import Path
import collections
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def read(path, default=None):
    file = ROOT / path
    return json.loads(file.read_text()) if file.exists() else default


def write(path, value):
    file = ROOT / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def code_for(rule):
    rid = rule['rule_id']
    family = rule['family']
    # These are navigation anchors, not independent proof of rule satisfaction.
    if rid == 'MDR-000':
        return ['standards/profiles/mdr-pending.json#MDR-000']
    if family == '표준 운영' or rid.startswith('DOC-'):
        return ['scripts/build-standards.py#main', 'scripts/evidence-check.mjs#validateEvidence', 'docs/ADR/0001-local-stack-and-evidence.md']
    if family == '코딩':
        return ['apps/web/tsconfig.json', 'apps/web/eslint.config.js', 'apps/api/BusinessRules.cs', 'docs/COMPANY_CODING_STANDARD.md']
    if family == '보안' or rid.startswith('OPS-'):
        return ['apps/api/Program.cs', 'apps/api/AuthController.cs', 'apps/api/RequestsController.cs', 'docs/SECURITY_STANDARD.md']
    if rid.startswith('QA-'):
        return ['scripts/run-checks.mjs', 'tests/e2e/browser.mjs', 'tests/backend/Kstd.Api.Tests/BusinessRulesTests.cs']
    if rid == 'INC-001':
        return ['docs/ACCESSIBILITY_STANDARD.md']
    if rid.startswith('UI-') and int(rid[3:]) in [8, 9, 10, 11, 12, 13, 14, 15]:
        return ['packages/ui/tokens.css', 'apps/web/src/styles.css', 'docs/UI_UX_STANDARD.md']
    return ['apps/web/src/App.tsx', 'apps/web/src/ui.tsx', 'apps/web/src/styles.css']


AUTO_LINKS = {
    'AUTO-LEDGER': ['GOV-004', 'GOV-007', 'DOC-001', 'DOC-002', 'DOC-003', 'DOC-004'],
    'AUTO-FRONTEND': ['COD-001', 'COD-002', 'COD-003', 'COD-009', 'COD-011', 'COD-012', 'QA-001'],
    'AUTO-BACKEND': ['COD-004', 'COD-005', 'COD-006', 'COD-007', 'COD-008', 'COD-015', 'COD-016', 'COD-017', 'COD-018', 'SEC-002', 'SEC-004', 'SEC-005', 'SEC-006', 'SEC-007', 'SEC-008', 'SEC-009', 'SEC-010', 'SEC-012', 'SEC-013', 'QA-002', 'QA-003', 'QA-004', 'OPS-001', 'OPS-002', 'OPS-004'],
    'AUTO-EXPORT': ['SEC-015', 'DOC-001', 'UI-127'],
    'E2E-WORKFLOW': ['QA-005', 'UI-084', 'UI-085', 'UI-092', 'UI-093', 'WCA-048', 'WCA-049', 'WCA-052', 'KWA-028', 'KWA-029', 'KWA-031'],
    'E2E-HELP': ['DOC-001', 'DOC-006', 'SEC-015', 'UI-127', 'INC-012'],
    'E2E-KEYBOARD': ['KWA-010', 'KWA-011', 'KWA-017', 'WCA-021', 'WCA-022', 'WCA-027', 'WCA-029', 'WCA-033'],
    'E2E-REFLOW': ['QA-009', 'WCA-010', 'WCA-015', 'WCA-017', 'WCA-019', 'INC-002'],
    'E2E-ERROR': ['UI-098', 'WCA-048', 'WCA-050', 'WCA-055', 'KWA-028'],
    'E2E-AXE': ['QA-006', 'KWA-003', 'KWA-008', 'KWA-018', 'KWA-023', 'KWA-025', 'KWA-029', 'KWA-032', 'WCA-007', 'WCA-014', 'WCA-028', 'WCA-037', 'WCA-041', 'WCA-049', 'WCA-054'],
    'AUTO-AUDIT': ['GOV-008', 'SEC-014', 'OPS-005'],
    'AUTO-SECRET': ['SEC-008', 'SEC-014', 'QA-001'],
    'SCREEN-LOGIN': ['UI-081', 'UI-082', 'UI-084', 'SEC-004', 'KWA-030', 'WCA-053'],
    'SCREEN-DASHBOARD': ['INC-009', 'UI-003'],
    'SCREEN-FORM': ['KWA-029', 'WCA-049', 'WCA-052'],
    'SCREEN-FORM-ERROR': ['KWA-028', 'WCA-048', 'WCA-050'],
    'SCREEN-COMPLETE': ['WCA-055', 'KWA-031'],
    'SCREEN-DETAIL': ['UI-067', 'SEC-005'],
    'SCREEN-LIST': ['UI-076', 'UI-078'],
    'SCREEN-MODAL': ['KWA-011', 'WCA-022', 'WCA-029'],
    'SCREEN-HELP': ['DOC-001', 'DOC-006', 'INC-012'],
    'SCREEN-GALLERY': ['UI-003', 'UI-010', 'KWA-033'],
    'SCREEN-MOBILE': ['WCA-017', 'QA-009'],
    'SCREEN-TEXT-SPACING': ['WCA-019'],
    'SCREEN-SERVER-ERROR': ['UI-068', 'WCA-055'],
    'SCREEN-EMPTY-RESULTS': ['WCA-055', 'UI-078'],
    'SCREEN-SERVER-VALIDATION': ['KWA-028', 'WCA-048', 'WCA-050', 'UI-068'],
}


def main():
    original = read('reference-package/standards_catalog.json')
    sources = read('reference-package/source_register.json')
    sources.extend([
        {'source_id': 'SRC-043', 'title': '국방데이터 코드설계표준 공식 목록', 'version': '20260428', 'url': 'https://www.data.go.kr/data/15083221/fileData.do?recommendDataYn=Y', 'local_file': '', 'kind': '공식 공공데이터 목록', 'scope': '사용자 제공 OA-9422 연결, 속성/물리명/도메인/유형, 목록성코드와 코드값관리 구분', 'access_status': '목록 확인 / 원본 CSV 미확보', 'retrieved_at': '2026-10-20'},
        {'source_id': 'SRC-044', 'title': '국방 메타데이터 관리시스템 용어 정의', 'version': '별표1(최신 적용지침 판본 재확인 필요)', 'url': 'https://law.go.kr/LSW/flDownload.do?bylClsCd=200201&flSeq=141017277', 'local_file': '', 'kind': '공식 용어정의', 'scope': 'MDR: Meta Data Registry 명칭 식별', 'access_status': '명칭 확인 / 세부 적용기준 별도', 'retrieved_at': '2026-10-20'}
    ])
    source_manifest = []
    for file in sorted((ROOT / 'references').glob('*.pdf')):
        source_manifest.append({'path': str(file.relative_to(ROOT)), 'sha256': sha(file), 'size': file.stat().st_size})
    for source in sources:
        if source['source_id'] in ['SRC-001', 'SRC-002']:
            match = next((x for x in source_manifest if (x['size'] > 1000000) == (source['source_id'] == 'SRC-001')), None)
            if match:
                source['local_file'] = match['path']
                source['sha256'] = match['sha256']
        source['current_run_access_status'] = '입력 출처 목록 보존; 이번 실행에서 원문 전체 재검증하지 않음'
        if source['source_id'] in ['SRC-001', 'SRC-002']:
            source['current_run_access_status'] = '원본 확보·전문 텍스트 추출·주요 변경쪽 대조; 시각/등급 전수검토 미완료'
        if source['source_id'] in ['SRC-004', 'SRC-005', 'SRC-007', 'SRC-012', 'SRC-038', 'SRC-043', 'SRC-044']:
            source['current_run_access_status'] = '2026-10-20 공식 페이지 재조회; 세부 통제 전체 판정과 구분'
    write('standards/source-register.json', sources)
    write('standards/source-manifest.json', source_manifest)
    for name in ['krds_source_inventory', 'krds_section_index', 'krds_interaction_index', 'source_issues', 'accessibility_scenarios']:
        write('standards/' + name.replace('_', '-') + '.json', read('reference-package/' + name + '.json'))
    inventory = read('standards/krds-source-inventory.json')
    for item in inventory:
        if item['id'] == 'KRDS-SEC-078-A-05':
            item['extraction_issue'] = '입력색인의 실시간 중 실 문자가 뒤로 이동한 추출순서 오류. 원본문장과 다름.'
            item['corrected_requirement_from_pdf_text'] = '실시간 검색어 입력 도움창은 검색어 입력 필드의 다음 요소로 제공한다.'
            item['correction_evidence'] = 'evidence/source/krds-guideline.txt PDF925쪽, candidate-audit.json 텍스트불일치 기록'
    write('standards/krds-source-inventory.json', inventory)
    results = read('evidence/index.json', [])
    evidence_by_test = collections.defaultdict(list)
    for evidence in results:
        evidence_by_test[evidence['test_id']].append(evidence)
    rules, records, tests = [], [], []
    status_fields = ['implementation_status', 'auto_result', 'manual_result', 'code_refs', 'test_refs', 'evidence_ids', 'reviewer', 'reviewed_at', 'deviation_id']
    previous = {r['rule_id']: r for r in read('standards/application-records.json', [])}
    code_map = {}
    for path in sorted((ROOT / 'standards').glob('code-map-*.json')):
        code_map.update(json.loads(path.read_text()))
    for base in original['rules']:
        rule = {k: v for k, v in base.items() if k not in status_fields}
        rid = rule['rule_id']
        if rid == 'MDR-000':
            rule.update(title='MDR 명칭 확인·세부 적용 확인필요', requirement='국방 메타데이터 관리시스템(Meta Data Registry) 명칭은 공식 용어정의와 사용자 제공 코드설계표준 목록으로 확인. 원본 코드표와 대상사업 적용범위 확보 후 속성명·물리명·도메인·유형·코드값을 대조해야 함.', source_id='SRC-043', source_version='목록 20260428 / 원본 CSV 미확보', applicability_reason='명칭은 확인했으나 OA-9422 원사이트400으로 원본코드표와 샘플 데이터 적용성이 미확정', planned_implementation='회사 업무요청 데이터사전과 국방 표준의 대응·길이·형식·코드값은 원문확보 후 별도 프로파일로 검토. 현재 임의 치환하지 않음')
        rule['applicable_languages'] = ['TypeScript', 'C#'] if rule['family'] == '코딩' else []
        rule['source_review_status'] = '재확인필요' if rule['family'] == 'KRDS UI/UX' else '미확인' if rid == 'MDR-000' else '입력 기준 유지'
        mapping = code_map.get(rid, {})
        refs = [p for p in mapping.get('code_refs', code_for(rule)) if (ROOT / p.split('#')[0]).exists()]
        manual_id = 'MAN-' + rid
        linked_auto = [test for test, ids in AUTO_LINKS.items() if rid in ids]
        test_refs = linked_auto + [manual_id]
        tests.append({
            'test_id': manual_id, 'rule_ids': [rid], 'type': '수동', 'title': rid + ' ' + rule['title'],
            'steps': f"1. 원문 {rule.get('source_id')} {rule.get('source_clause', '')} / {rule.get('source_page', '')}쪽과 적용조건을 확인한다. 2. {rule.get('target_screens')}의 일반사용자·관리자 및 기본/오류/로딩/완료/모바일 상태 중 관련 범위를 열어 확인한다. 3. {rule.get('verification_method')}. 4. 미검사 범위와 실제 환경·검사자·관찰·증빙을 기록한다.",
            'expected': rule['requirement'] + ' 구체화: ' + rule.get('planned_implementation', ''),
            'environment': '원문 검토 + 실제 브라우저/필요 AT. NVDA·TalkBack·VoiceOver는 확보한 실제 조합만 기록',
            'status': '미실행', 'observed': '사람의 평가/원문등급 판정을 자동 생성하지 않음', 'evidence_ids': [],
            'applicability': rule['applicability'], 'reassessment_condition': rule.get('trigger_condition') or '대상 기능·기관·계약·제품 범위가 변경될 때 재평가'
        })
        ev = [e for test in linked_auto for e in evidence_by_test[test]]
        failures = any(e['result'] == '실패' for e in ev)
        auto_result = '실패' if failures else '부분확인' if any(e['result'] == '통과' for e in ev) else '미실행'
        implementation = '진행' if refs else '계획'
        # Code pointers alone never prove full implementation of a source clause.
        implemented_ids = set(read('standards/implementation-reviewed.json', []))
        if rid in implemented_ids:
            implementation = '구현'
        implementation = mapping.get('implementation_status', implementation)
        if rule['applicability'] == '해당없음':
            implementation = '해당없음'
        if rid == 'MDR-000':
            implementation = '계획'
            auto_result = '미실행'
        manual = previous.get(rid, {})
        manual_result = manual.get('manual_result', '미실행')
        evidence_ids = [e['evidence_id'] for e in ev]
        record = {
            'rule_id': rid, 'applicability': rule['applicability'], 'applicability_reason': rule['applicability_reason'],
            'trigger_condition': rule.get('trigger_condition') or '관련 기능·적용 기관·계약 변경 시 재평가',
            'implementation_status': implementation,
            'implementation_summary': mapping.get('implementation_summary', '연결된 코드·설정·설명은 존재함. 원문 요구의 모든 상태·예외 충족 여부는 개별 시험/검토 필요.' if refs else '실제 구현 연결 대기'),
            'code_refs': refs, 'test_refs': test_refs, 'auto_result': auto_result,
            'manual_result': manual_result, 'evidence_ids': evidence_ids,
            'reviewer': manual.get('reviewer', ''), 'reviewed_at': manual.get('reviewed_at', ''),
            'deviation_id': '', 'official_exception': None, 'company_deviation': None,
            'final_result': '확인필요' if rid == 'MDR-000' else '해당없음' if rule['applicability'] == '해당없음' else '실패' if failures else '부분확인' if ev else '미실행'
        }
        # Only automatic-only ledger controls can be completed by an executable check.
        if rid in ['DOC-001', 'DOC-003'] and any(e['test_id'] == 'AUTO-LEDGER' and e['result'] == '통과' for e in ev):
            record['auto_result'] = '통과'
        records.append(record)
        rules.append(rule)
    for test_id, rule_ids in AUTO_LINKS.items():
        ev = evidence_by_test[test_id]
        tests.append({'test_id': test_id, 'rule_ids': rule_ids, 'type': '캡처' if test_id.startswith('SCREEN-') else '자동', 'title': test_id,
                      'steps': 'evidence의 command와 환경으로 실제 실행; 기록된 assertion 범위만 확인',
                      'expected': '실제 검사 assertion 및 로그 일치. 관련 원문 조항의 전수 통과를 의미하지 않음',
                      'environment': '로컬 macOS / Chromium / Node / .NET10',
                      'status': '실패' if any(e['result'] == '실패' for e in ev) else '통과' if ev and all(e['result'] == '통과' for e in ev) else '부분확인' if ev else '미실행',
                      'observed': '\n'.join(e.get('observed', '') for e in ev),
                      'evidence_ids': [e['evidence_id'] for e in ev]})
    for at in read('reference-package/accessibility_scenarios.json'):
        tests.append({'test_id': at['id'], 'rule_ids': at['related_ids'].split(','), 'type': '수동', 'title': at['scenario'],
                      'steps': at['steps'], 'expected': at['acceptance'], 'environment': at['environment'],
                      'status': '미실행', 'observed': '보조기술·당사자 환경에서 실제 수행하지 않음', 'evidence_ids': []})
    meta = dict(original['meta'], version='0.2', status='실행 샘플 / 자동검사 일부실행 / 수동 검토 대기')
    write('standards/catalog.json', {'meta': meta, 'rules': rules})
    write('standards/application-records.json', records)
    write('standards/tests.json', tests)
    write('standards/coverage-map.json', [{'rule_id': r['rule_id'], 'test_ids': r['test_refs'], 'code_refs': r['code_refs']} for r in records])
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    families = []
    for family in original['meta']['families']:
        ids = {r['rule_id'] for r in rules if r['family'] == family}
        rows = [r for r in records if r['rule_id'] in ids]
        counts = collections.Counter(r['applicability'] for r in rows)
        families.append({'family': family, 'total': len(rows), 'applicable': counts['적용'], 'conditional': counts['조건부'], 'not_applicable': counts['해당없음'], 'unconfirmed': counts['확인필요'], 'implemented': sum(r['applicability'] == '적용' and r['implementation_status'] == '구현' for r in rows), 'verified': sum(r['applicability'] == '적용' and r['final_result'] == '통과' for r in rows)})
    limitations = ['MDR 명칭 확인 / 원본코드표·사업적용범위 확인필요', '원문 등급·그림/예외/비번호 규칙 전수 수동 검토 미완료', 'NVDA/TalkBack/VoiceOver 실제 음성·당사자 사용성 평가 미실행', '운영 TLS·백신·상용 정적분석·외부 CI 실제실행 미확인', '자동 assertion 통과는 해당 표준 전체 통과나 인증이 아님', '검토자/검토일 자동생성하지 않으며 종합 검증완료는 보류']
    summary = {'as_of': '2026-10-20', 'commit_sha': commit, 'families': families, 'rule_count': len(rules), 'test_count': len(tests), 'evidence_count': len(results), 'limitations': limitations}
    write('standards/summary.json', summary)
    write('apps/web/public/standards-data.json', {'meta': meta, 'catalog': rules, 'applicationRecords': records, 'sources': sources, 'evidence': results, 'tests': tests, 'summary': summary})
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
