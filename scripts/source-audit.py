"""Check extracted candidates against PDF text without inventing source grades."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
inventory = json.loads((root / 'reference-package/krds_source_inventory.json').read_text())
pages = (root / 'evidence/source/krds-guideline.txt').read_text().split('\f')


def normalize(value):
    return re.sub(r'[^가-힣a-zA-Z0-9]', '', value).lower()


rows = []
for item in inventory:
    target_pages = [item['source_pdf_page']] + item.get('source_detail_pages', [])
    text = ''.join(pages[i - 1] for i in target_pages if 0 < i <= len(pages))
    candidate = normalize(item['requirement'])
    match = candidate in normalize(text)
    rows.append({'id': item['id'], 'pdf_pages': target_pages, 'text_match': match,
                 'source_requirement_level': '미확인',
                 'review_status': '텍스트 일치 / 원문 시각·등급·예외 전수검토 대기' if match else '추출문장/페이지 수동 재대조 필요',
                 'implementation_result': '이 출처대조는 구현·준수 통과가 아님'})
result = {'scope': '1181 PDF쪽 전문 텍스트와 번호후보725개 텍스트 대조, 색인103개/상호작용52쪽 보존',
          'candidate_count': len(rows), 'text_match_count': sum(r['text_match'] for r in rows),
          'selected_visual_pages': [123, 249, 1007],
          'visual_observation': '123쪽 역할별15/7/4.5 확인;249쪽 개인정보 처리방침 명칭/구분 확인;1007쪽 로그인배치 권장 표식 확인',
          'limitations': 'PDF전체 시각 검토 아님. 일치가 공식 전체항목수/적용등급/준수 통과를 뜻하지 않음. 652쪽 빈07/08 보존.',
          'rows': rows}
(root / 'evidence/source/candidate-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'rows'}, ensure_ascii=False, indent=2))
