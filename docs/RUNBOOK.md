# FlowCore 실행과 운영 인수

## 로컬 실행

필요환경: Git, Node.js24 이상(현재26.5.0에서 확인), Python3.12 이상, .NET SDK10.0.402. SDK가 PATH에 없으면 `~/.dotnet/dotnet`을 사용한다. `global.json`과 잠금파일을 보존한다. 소스 ZIP에는 증빙 commit 검증에 필요한 이 프로젝트의 Git 이력이 포함되며, remote·hooks·개발 비밀번호·실제 DB는 포함하지 않는다.

```sh
npm run setup
npm run dev
```

브라우저 `http://localhost:8000`, API `http://127.0.0.1:8001/api/health`. 포트 충돌은 기존 프로세스와 소유자를 확인한 후 해당 실행을 종료한다. Ctrl+C로 웹/API를 함께 중지한다. `setup`은 원본을 삭제하지 않고 잠금 의존성을 복원하며 `.env`가 없을 때만 임의 개발 비밀번호를 생성한다. 최초 서버 시작 시 EF migration과 개발 seed가 실행된다.

계정은 `user@sample.test`(일반 사용자),`admin@sample.test`(관리자),`other@sample.test`(타사용자 권한시험용)이다. 암호는 로컬 `.env`의 `SAMPLE_USER_PASSWORD`/`SAMPLE_ADMIN_PASSWORD`에서 확인한다. `.env`는 저장소/다운로드 보고서에 포함하지 않는다. 초기화 후 env만 변경해도 기존DB의 암호는 변경되지 않는다. 실제 업무정보·비밀번호를 샘플에 입력하지 않는다.

## 검사와 결과 재생성

```sh
npm run verify
# dev 실행 상태에서 별도 터미널
npm run test:e2e
npm run test:a11y
npm run standards
npm run evidence:check
npm run reports
```

`verify`는 실제 format/lint/type/build/unit/API통합/의존성/원장 검사를 실행하고 로그와 증빙 manifest를 남긴다. 백엔드 실제1분 세션만료 시험으로 약1분 이상 걸린다. E2E는 별도 Chromium을 설치해 로그인·등록·첨부·관리처리·Help복사/다운로드·오류·모달·반응형 및 axe 상태검사를 수행한다. 가상 샘플 요청을 추가하며 기존 데이터를 삭제하지 않는다. `test:a11y`는 같은 업무 상태를 구성하고 axe도 실행하는 통합 검사다.

`reports`는 기존 증빙을 읽어 xlsx/pptx/html을 다시 생성하고 Help 다운로드 폴더를 동기화한다. 시험을 실행하거나 미실행을 PASS로 바꾸지 않는다. 보고서 재생성에는 Codex 번들 `@oai/artifact-tool`과 presentations 스킬 runtime이 필요하다. 기본 위치는 `~/.cache/codex-runtimes/codex-primary-runtime/dependencies`, 대체 설정은 `CODEX_ARTIFACT_RUNTIME`/`CODEX_PRESENTATIONS_SKILL`이다. 앱 자체 실행과 미리 생성된 보고서 열기에는 이 의존성이 필요 없다.

`evidence/index.json`은 검사별 최신 결과, `evidence/<run-id>/*.manifest.json`은 이전 실행을 포함한 이력이다. commit과 시험 시점 코드 SHA256,실행시각,명령,도구버전,실제 종료코드,결과파일hash를 보존한다. 코드가 바뀌면 관련 자동시험을 다시 실행해야 하며 stale source hash를 PASS로 소비하지 않는다. 단위/DOM자동검사를 NVDA/실제VoiceOver/사용자평가로 승격하지 않는다.

## DB·첨부 백업과 복원

기본 경로 `apps/api/data`의 `kstd.db`,`uploads`,`keys`를 함께 보존한다. 다른 경로는 `KSTD_DATA_DIR`로 설정한다. DB와 첨부 일관성을 위해 서버 쓰기를 중지한 후 백업한다.

```sh
python3 scripts/backend.py backup --archive backups/local-snapshot.tar.gz
```

복원/개발reset은 기존 DB·첨부·인증키를 대체하거나 삭제한다. 명령을 인자 없이 실행하면 정확한 절대 대상과 영향을 출력하고 거부한다. 출력된 절대경로를 확인한 후에만 `--confirm-target`으로 지정한다. 운영모드에서 이 개발 도구는 차단된다.

```sh
python3 scripts/backend.py restore-db --archive backups/local-snapshot.tar.gz
python3 scripts/backend.py reset
```

복원 후 APIhealth,로그인,기존 요청과 첨부바이트·권한·이력을 확인한다. 스키마는 `apps/api/Migrations`에서 관리하고 `python3 scripts/backend.py migrate`로 적용한다. migration rollback은 먼저 스냅샷을 확보하고 `dotnet ef database update <이전Migration> --project apps/api`를 검토한다. 데이터손실 위험이 있으면 DB/첨부를 함께 복원한다.

## 로컬 배포 산출물

```sh
npm run publish:local
```

`artifacts/api`에 Release 서버와 `wwwroot` 프런트가 생성된다. .NET10 런타임이 있는 대상에서 서버를 실행하는 동일출처 구조다. 실제 외부 공개 배포는 수행하지 않았다. Production 환경은 HTTPS/리버스프록시,Secure쿠키/HSTS,제한된CSP,영속적인인증키/DB경로,최소권한,백업/복원,악성파일검사,자원제한과모니터링을 실제 환경에서 검증해야 한다. Production seed는 차단한다.

## 잔여 검사

MDR 이름은 국방Meta Data Registry로 확인했다. 원본국방코드표·적용사업을 확보해 별도데이터사전 검토가 필요하다. 원문등급/비번호예외전수검토,실제200%글자/400%확대,AT·당사자평가,운영TLS/백신,상용분석,외부CI실행은 원장에 미실행/확인필요로 유지한다. GitHub CI설정은 제공하되 원격에 연결되어 실제 실행됐다는 주장을 하지 않는다.
