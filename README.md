# FlowCore 회사 SW 표준 적용 샘플

실제 React/TypeScript + ASP.NET Core/.NET10 + EF Core/SQLite 업무요청 프로그램입니다. 일반사용자 요청 등록·수정·첨부·조회,관리자 상태변경·이력,접근성설정/컴포넌트갤러리를 제공합니다.

```sh
npm run setup
npm run dev
```

`http://localhost:8000`으로 접속하세요. 일반사용자 `user@sample.test`,관리자 `admin@sample.test`. 최초 생성된 비밀번호는 `.env`에서 확인합니다. [실행·검사·백업·배포 안내](docs/RUNBOOK.md).

도움말 `/help`에서297개 통합 관리행을 분류/적용성/검증상태/ID·내용으로 검색하고,각 항목의 출처·판본·페이지·구현코드·시험·실제증빙을 펼쳐봅니다. 항목별 문서용 복사,권한거부시 수동복사,필터결과JSON/CSV/Markdown,전체Excel/PPTX/HTML다운로드를 제공합니다.

입력패키지 원본은 `reference-package`,PDF원본은 `references`,정의·적용·시험은 `standards`,실제실행로그/캡처/manifest는 `evidence`,최종문서는 `reports`입니다. `npm run reports`는 동일원장으로 결과를 재생성합니다.

MDR은 사용자 링크와 공식출처로 **국방 메타데이터 관리시스템(Meta Data Registry)** 명칭을 확인했습니다. 원본 코드표/사업적용범위는 확인필요입니다. 자동시험 통과를 외부표준전수준수·접근성인증으로 표시하지 않습니다. 수동AT/원문등급전수/운영보안 미실행은 원장에 유지합니다.
