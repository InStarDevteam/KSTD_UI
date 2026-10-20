# API 운영·복구 안내

기준: 2026-10-20. SDK 10.0.402, ASP.NET Core/EF Core 10.0.13, C# nullable 및 분석기, SQLite. [.NET 공식 지원 정책](https://dotnet.microsoft.com/en-us/platform/support/policy)의 .NET10 LTS(지원종료2028-11-14)와 [다운로드](https://dotnet.microsoft.com/en-us/download/dotnet/10.0)를 확인했다. SDK/패키지는 global.json/packages.lock.json/tool manifest에 고정했다.

개발은 `ASPNETCORE_ENVIRONMENT=Development`에서 `SAMPLE_SEED=true`와 `SAMPLE_USER_PASSWORD`, `SAMPLE_ADMIN_PASSWORD`(각12자이상)를 외부에서 주입한 뒤 `python3 scripts/backend.py restore`, `python3 scripts/backend.py run`으로 실행한다. root의 npm 실행 스크립트를 우선 사용해도 된다. 사용자=user@sample.test, 관리자=admin@sample.test, 권한시험용 다른 사용자=other@sample.test(사용자 암호 공유). DB가 이미 있으면 seed는 기존 계정을 변경하지 않는다. 암호를 바꾸려면 개발DB 전체reset 영향을 확인하거나 정식 암호변경 절차를 구현해야 한다. 샘플 계정seed는 Production에서 항상 예외로 중단한다.

API 기본포트8001, URI /api. 개발에서는 웹8000의 /api 프록시를 사용한다. 운영 패키지는 Vite dist를 API wwwroot로 복사해 동일 출처로 제공한다. Unknown /api는404이고 그 외 SPA경로는index.html로 돌아간다. 운영은 HTTPS가 필수이고 `ASPNETCORE_URLS` 또는 신뢰된 TLS 종료구성을 지정한다. 프록시 ForwardedHeaders는 신뢰된 프록시 목록과 함께 운영환경에서 따로 설정해야 한다. localhost HTTP개발에서는 Secure 쿠키에 SameAsRequest를 적용하고, 운영에서는Always다. 운영TLS, 인증서, 프록시, 키암호화/회전의 실제 배포검증은 미실행이다.

서버가 사용자/관리자 역할과 요청·첨부 객체권한을 강제한다. 일반사용자는 본인 요청만 조회하고, 본인 접수상태 요청만 수정한다. 관리자는 전체 조회와 허용된 상태전이(접수→처리중/반려, 처리중→완료/반려)를 수행한다. 모든 쓰기 요청은CSRF토큰을 검증한다. `version` 낙관적동시성은 DB조건에 포함되고, 요청의 선택적 `Idempotency-Key` UUID는 작성자와 함께 고유제약으로 중복저장을 방지한다. 같은 키와 다른 내용을 보낼 때에도 최초 결과가 반환되므로 신규 폼에서는 새 UUID를 사용한다.

요청·첨부목록·이력·감사이벤트는 `apps/api/data/kstd.db`에, 첨부는 `data/uploads`에, 프레임워크 인증키는 `data/keys`에 보존한다. `KSTD_DATA_DIR`로 전용 디렉터리를 지정할 수 있다. data는웹루트밖이며 실행파일로 서비스하지 않는다. SQLite운영 확장 시 AppDb/EF provider를 교체하고 별도의 마이그레이션·동시성·부하검사를 수행한다. 인증키는 샘플 로컬 파일저장으로 디스크암호화/접근제어를 운영전 적용해야 한다.

첨부는 파일당5MiB, 요청당3개, txt UTF-8/제어문자 검사, PDF `%PDF-`, PNG8바이트signature를 확인한다. signature확인은 문서의 무해성/완전한파싱검증을 보장하지 않는다. 악성코드검사엔진·격리대기·CDR·운영백업 암호화는 미구현이며 공개운영전 필수위험검토 대상이다. 랜덤저장명, 원본경로제거, 다운로드별인가, attachment Content-Disposition과nosniff를 적용한다.

`python3 scripts/backend.py migrate`는EF마이그레이션을 적용한다. API시작도 미적용 마이그레이션을 적용한다. 운영에서는 배포전 백업과 검토된 migration실행을 권장한다. 스키마파일은 apps/api/Migrations에 있고 모델과 일치한다.

API를중지한뒤 `python3 scripts/backend.py backup --archive /절대경로/backup.tar.gz`로 SQLite backup API의 DB사본과첨부·인증키를 묶는다. 파일시스템과DB의동일시점 정합성을 위해 서버중지가 필요하다. 백업파일은0600으로만들고 인증키가포함되므로 비밀자료로보관한다. 암호화·외부보관·복구주기·보존정책은운영전결정한다.

복구는 `python3 scripts/backend.py restore-db --archive /절대경로/backup.tar.gz --confirm-target /정확한/data/절대경로`로 수행한다. 대상 DB·첨부·인증키를모두교체하므로API를먼저중지한다. reset은 `python3 scripts/backend.py reset --confirm-target /정확한/data/절대경로`이며기존DB/첨부/인증키를삭제한다. target확인인자가없으면실행하지않고 Production설정에서는거부한다. 이는개발도구이며운영복구승인절차를대체하지않는다.

검증은 `node scripts/backend-verify.mjs`로locked restore/build/format/xUnit30개/실제HTTP통합44개/의존성검사를실행한다. 통합시험은임시DB와18001포트를사용하고 실제인증·보안·파일·재시작·1분세션만료·백업복구를검사한다. 원시결과는evidence/backend에있다. Coverlet결과는xUnit시험이계측한범위이며 별도HTTP프로세스의통합시험커버리지를합산하지않는다. 전체서버의80%/70%목표달성근거로사용하지않는다.

로그아웃은 동일 계정의 모든 장치/브라우저 세션을 종료하는 샘플 정책이다. DB의 SessionVersion을 원자적으로 증가시키고 Cookie OnValidatePrincipal에서 매 요청 DB 현재 버전과 티켓 claim을 비교한다. 복제한 쿠키도 즉시 거부되며 이전 버전의 stamp 없는 쿠키는 재로그인이 필요하다. 확장 시 분산 캐시/DB 부하와 세션별 폐기 정책을 재검토한다.

Unix 데이터/업로드/키 디렉터리는0700, DB와 업로드 파일은0600으로 제한한다. 재시작 시 DB/WAL/SHM 및 기존 인증키 파일 권한도0600으로 조정한다. Windows ACL과 운영 인증키 암호화는 별도 미검증이며 XML 키 암호화를 구현했다고 주장하지 않는다.
