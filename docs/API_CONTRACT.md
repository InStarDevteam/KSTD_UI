# 샘플 API 계약

`http://localhost:8001/api`, 프런트는 `localhost:8000` 동일 출처 개발 프록시를 사용한다. JSON camelCase, UTF-8, 시각 ISO8601 UTC. 요청 등록의 `Idempotency-Key`는 UUID 선택 헤더이며 같은 키 재전송 시 기존 요청을 반환해 중복 저장을 막는다. 쿠키 인증, mutation은 `X-CSRF-TOKEN` 필수. 최초 및 로그인 후 `GET /auth/csrf`에서 `{token}`을 얻는다. HTTP는 localhost Development 한정이며 운영은 HTTPS 및 Secure cookie 필수다.

| 메서드·경로 | 입력 | 응답 |
| --- | --- | --- |
| GET /auth/csrf | 없음 | `{token}` |
| POST /auth/login | `{email,password}` | 세션 |
| GET /auth/me | 없음 | 세션, 비인증 401 |
| POST /auth/extend | 없음 | 세션; 만료 전 무제한 연장 가능 |
| POST /auth/logout | 없음 | 204; 동일 계정 모든 세션 폐기 |
| GET /summary | 없음 | `{total,byStatus:[{status,count}]}` |
| GET /requests | q,status,sort,page,pageSize | `{items,total,page,pageSize}` |
| GET /requests/{id} | 없음 | 상세 |
| POST /requests | `{title,category,description}` | 201 상세 |
| PUT /requests/{id} | `{title,category,description,version}` | 상세 |
| POST /requests/{id}/status | `{status,reason,version}` | 상세 |
| POST /requests/{id}/attachments | multipart `files` | 상세 |
| DELETE /attachments/{id} | 없음 | 204 |
| GET /attachments/{id}/download | 없음 | 인가된 파일, attachment |
| GET /health | 없음 | DB 연결 상태 |

세션: `{user:{id,email,displayName,role},expiresAt,remainingSeconds,warningSeconds:60}`. 20분 기본 세션, 만료 60초 전 경고, 연장 제한 없음. Development의 `SAMPLE_SESSION_MINUTES`는 1~120분 설정 가능.

상세: `{id,title,category,description,status,ownerId,ownerName,createdAt,updatedAt,version,attachments:[{id,fileName,size,contentType}],histories:[{id,action,fromStatus,toStatus,reason,actorName,createdAt}]}`. 목록 items는 이 구조를 사용한다.

상태는 `submitted/in_progress/completed/rejected`. 관리자는 submitted→in_progress/rejected, in_progress→completed/rejected만 변경 가능. 요청 수정/첨부변경은 작성자이고 submitted 상태인 경우 가능하다. 관리자 전체 조회, 일반사용자 본인만 조회한다. 존재 확인을 통한 정보노출 방지를 위해 다른 사용자의 개체는 404다.

category=`general/access/software/other`. 제목3~100자, 내용10~5000자, 처리사유3~500자. 정렬=`created_desc/created_asc/title_asc`, page≥1, pageSize1~100. 한 요청의 첨부 최대3개, 파일당5MiB, txt/pdf/png의 확장자와 실제 signature/UTF-8 검사. 첨부는 웹루트 외부에 랜덤명 저장. 악성코드 탐지엔진은 미구현이다.

에러는 ProblemDetails `{status,title,detail,code,traceId,errors?}`. 검증400, 비인증401, 관리자권한403, 존재/객체인가404, 동시수정409, 너무큼413, 로그인제한429. 낙관적 동시성 `version`은 서버에서 증가한다.

개발 seed는 `SAMPLE_SEED=true` 및 `SAMPLE_USER_PASSWORD`, `SAMPLE_ADMIN_PASSWORD` 환경변수가 있어야 작동한다(최소12자). 계정은 user@sample.test, admin@sample.test, other@sample.test(권한시험용, 사용자 비밀번호 사용). 운영모드 seed는 명시적으로 거부한다. 비밀번호는 프레임워크 PasswordHasher로 해시하고 응답/로그에 포함하지 않는다.

로그아웃 정책: 사용자별 `SessionVersion`을 증가시키고 모든 인증 요청에서 DB 버전을 확인한다. 따라서 복제된 이전 쿠키와 다른 브라우저/장치의 동일 계정 세션도 즉시 무효화된다. 정책상 다른 장치도 다시 로그인해야 한다. 버전 claim이 없는 이전 버전 쿠키도 무효화한다.
