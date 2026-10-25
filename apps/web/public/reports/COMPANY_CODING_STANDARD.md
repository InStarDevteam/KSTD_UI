# 회사 코딩 기준 0.2 (승인 전)

- TS 컴포넌트/타입과 C# 공개 멤버는 PascalCase, 함수/변수/인자는 camelCase를 사용한다. TS strict 및 nullable 분석을 활성화한다.
- `.editorconfig`, ESLint/Prettier, `dotnet format`으로 UTF-8/개행/공백을 검사한다. 타입 억제나 무근거 any, 빈 catch, Promise 방치, `.Result`/`.Wait()`를 금지한다.
- 경계 데이터는 unknown에서 검증한다. 서버 DTO는 허용 필드와 길이·값을 검증한다. UI 검증은 서버 검증을 대신하지 않는다.
- UI는 표시/상호작용, 애플리케이션은 업무 흐름, 도메인은 상태전이/권한, 영속성은 EF Core로 책임을 분리한다. 필요 없는 계층은 추가하지 않는다.
- 비동기 I/O에는 취소·타임아웃을 전파한다. using으로 자원을 해제하고 동시수정/중복처리는 서버에서 통제한다. UTC 저장 후 Asia/Seoul로 표시한다.
- 오류는 안정된 코드·traceId로 전달하고 스택·토큰·비밀번호를 노출하지 않는다. 공개 API의 목적·입출력·오류는 API 계약에서 설명한다.
- 회사 경고 목표는 ESLint complexity 10, max-depth 3이다. 생성코드/외부 라이브러리는 복잡도 측정에서 제외하되 취약점/라이선스 관리에서는 제외하지 않는다. C# 동일 산식 측정은 전용 도구가 없으면 미실행이다.
- 핵심 권한/상태전이는 실패 경계시험을 포함한다. coverage는 실제 도구 출력이 있을 때만 line/branch 수치를 보고한다. 회사 제안 80%/70%를 달성했다고 추정하지 않는다.

C#/TypeScript 프로파일만 적용한다. C/C++/Java/Python 전체 규칙이나 MISRA/ASVS 전체 등급 준수를 주장하지 않는다. `scripts/`의 Python은 원장 변환 보조도구이며 제품 언어 준수 실적과 분리한다.
