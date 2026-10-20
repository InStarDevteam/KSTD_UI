# ADR 0002: 작은따옴표가 있는 작업 경로의 Release publish

- 상태: 로컬 샘플 구현 결정
- 기준일: 2026-10-20
- 대상: .NET SDK 10.0.402, `npm run publish:local`

현재 작업 경로의 `Q'Dev`를 포함한 절대 출력 경로로 `dotnet publish --output artifacts/api --no-restore`를 실행하면 `Microsoft.NET.Publish.targets`의 `_CopyResolvedFilesToPublishPreserveNewest`에서 MSB3094가 발생했다. Release 컴파일은 성공했지만 `DestinationFiles`는1개, `SourceFiles`는35개로 해석됐다. 설치 SDK의 해당 item transform은 `@(...->'$(PublishDir)%(RelativePath)')` 형태이며 출력 경로의 작은따옴표가 표현식에 들어간다. 한글을 제거해야 한다고 추정하지 않는다.

동일한 원본 프로젝트와 잠금 의존성을 유지한 채, 출력 경로만 작은따옴표가 없는 `/tmp` 하위 임시 디렉터리로 바꾼 실제 publish는 성공했다. 따라서 소스를 복제하거나 SDK target을 수정하지 않고, `scripts/manage.mjs`의 publish 단계에서 OS 임시 폴더에 Release 산출물을 만든 뒤 Node 파일 API로 `artifacts/api`에 복사한다. 그 다음 Vite dist를 `wwwroot`에 복사하고 임시 폴더는 finally에서 제거한다. 기존 artifacts 디렉터리 전체를 삭제하지 않는다.

사용자는 계속 `npm run publish:local`을 실행한다. 임시 디렉터리 경로에도 작은따옴표가 있으면 실패 원인을 표시하고 TMPDIR/TEMP를 안전한 경로로 지정하도록 안내한다. DB·첨부·인증키는 배포 코드 디렉터리 밖에 보관해야 하며 `scripts/test-distribution.mjs`는 배포물의 DB/키/.env 혼입을 거부한다.

검증 범위는 실제 Release publish와 별도 임시 DB를 사용하는 localhost 독립 배포 smoke 시험이다. 원시 결과는 AUTO-DISTRIBUTION 증빙에 연결한다. SDK 자체 결함을 수정한 것이 아니며 실제 외부 공개 배포나 운영 TLS 검증을 뜻하지 않는다.

참조: [공식 SDK publish target](https://github.com/dotnet/sdk/blob/main/src/Tasks/Microsoft.NET.Build.Tasks/targets/Microsoft.NET.Publish.targets), 실제 설치된 SDK 10.0.402의 동일 파일372행.
