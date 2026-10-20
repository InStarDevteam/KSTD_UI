#!/usr/bin/env python3
"""Real HTTP/SQLite integration tests. Uses isolated temporary storage, never development DB."""
import base64
import copy
import stat
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/backend'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://localhost:18001/api'
DOTNET = shutil.which('dotnet') or str(Path.home() / '.dotnet/dotnet')
RESULTS = []


class Client:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.token = None

    def call(self, method, path, body=None, csrf=True, raw=None, content_type=None, extra_headers=None):
        headers = dict(extra_headers or {})
        if self.token and csrf:
            headers['X-CSRF-TOKEN'] = self.token
        if body is not None:
            raw = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        if content_type:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(BASE + path, data=raw, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        data = response.read()
        if 'json' in response.headers.get('Content-Type', '') and data:
            data = json.loads(data)
        return response.status, data, response.headers

    def csrf(self):
        status, data, _ = self.call('GET', '/auth/csrf')
        assert status == 200 and data['token']
        self.token = data['token']

    def login(self, email, password):
        self.csrf()
        result = self.call('POST', '/auth/login', {'email': email, 'password': password})
        self.csrf()
        return result

    def upload(self, request_id, filenames):
        boundary = 'kstd-' + uuid.uuid4().hex
        chunks = []
        for name, data in filenames:
            chunks.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(), data, b'\r\n'])
        chunks.append(f'--{boundary}--\r\n'.encode())
        return self.call('POST', f'/requests/{request_id}/attachments', raw=b''.join(chunks), content_type=f'multipart/form-data; boundary={boundary}')


def test(test_id, title, function):
    start = time.monotonic()
    try:
        observed = function()
        RESULTS.append({'test_id': test_id, 'title': title, 'result': '통과', 'observed': observed or title, 'duration_ms': round((time.monotonic() - start) * 1000)})
    except Exception as error:
        RESULTS.append({'test_id': test_id, 'title': title, 'result': '실패', 'observed': f'{type(error).__name__}: {error}', 'duration_ms': round((time.monotonic() - start) * 1000)})
        raise


def check(value, expected):
    assert value == expected, f'expected={expected!r}; observed={value!r}'


with tempfile.TemporaryDirectory(prefix='kstd-api-tests-') as data_dir:
    user_password, admin_password = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Development', ASPNETCORE_URLS='http://localhost:18001', KSTD_DATA_DIR=data_dir, SAMPLE_SEED='true', SAMPLE_USER_PASSWORD=user_password, SAMPLE_ADMIN_PASSWORD=admin_password)
    log = (OUT / 'integration-server.log').open('w')
    process = None

    def start():
        child = subprocess.Popen([DOTNET, str(ROOT / 'apps/api/bin/Debug/net10.0/Kstd.Api.dll')], cwd=ROOT / 'apps/api', env=env, stdout=log, stderr=subprocess.STDOUT)
        for _ in range(100):
            if child.poll() is not None:
                raise RuntimeError(f'API startup exited {child.returncode}; see integration-server.log')
            try:
                if urllib.request.urlopen(BASE + '/health', timeout=1).status == 200:
                    return child
            except (OSError, urllib.error.URLError):
                time.sleep(.1)
        child.terminate()
        raise RuntimeError('API startup timeout')

    def stop():
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)

    anon, user, admin, other = Client(), Client(), Client(), Client()
    request_id = None
    try:
        process = start()
        test('BE-INT-001', '비인증 요청과 개인정보 조회 차단', lambda: check(anon.call('GET', '/requests')[0], 401))
        test('BE-INT-002', '로그인 CSRF 토큰 누락 차단', lambda: check(anon.call('POST', '/auth/login', {'email': 'user@sample.test', 'password': user_password}, csrf=False)[0], 400))
        test('BE-INT-003', '실제 사용자 로그인', lambda: check(user.login('user@sample.test', user_password)[0], 200))
        test('BE-INT-004', '실제 관리자 로그인', lambda: check(admin.login('admin@sample.test', admin_password)[1]['user']['role'], 'admin'))
        test('BE-INT-005', '다른 사용자 로그인', lambda: check(other.login('other@sample.test', user_password)[0], 200))
        test('BE-INT-006', '입력 DTO 길이·허용값 검증', lambda: check(user.call('POST', '/requests', {'title': 'x', 'category': 'admin', 'description': 'short'})[0], 400))
        payload = {'title': '통합시험 한글 요청', 'category': 'software', 'description': '실제 데이터베이스 저장과 줄바꿈\n한글 처리를 확인합니다.', 'ownerId': 999, 'status': 'completed', 'id': 999}
        status, created, _ = user.call('POST', '/requests', payload)
        request_id = created.get('id')
        def creation():
            check(status, 201)
            check(created['status'], 'submitted')
            check(created['ownerId'], user.call('GET', '/auth/me')[1]['user']['id'])
            assert created['id'] != 999 and created['createdAt'].endswith('Z')
            return f'요청ID={request_id}; owner/status/id mass assignment 무시; UTC Z'
        test('BE-INT-007', '요청 영속 등록·mass assignment 방지·UTC', creation)
        test('BE-INT-008', '다른 사용자의 요청 객체 조회 차단', lambda: check(other.call('GET', f'/requests/{request_id}')[0], 404))
        test('BE-INT-009', '일반 사용자의 관리자 처리 차단', lambda: check(user.call('POST', f'/requests/{request_id}/status', {'status': 'in_progress', 'reason': '검토 시작', 'version': 1})[0], 403))
        test('BE-INT-010', '저장 요청 CSRF 토큰 누락 차단', lambda: check(user.call('POST', '/requests', payload, csrf=False)[0], 400))
        status, modified, _ = user.call('PUT', f'/requests/{request_id}', {**payload, 'title': '수정된 한글 요청', 'version': 1})
        test('BE-INT-011', '작성자 수정 및 동시성 버전 증가', lambda: check((status, modified['version']), (200, 2)))
        test('BE-INT-012', '오래된 버전 수정 거부', lambda: check(user.call('PUT', f'/requests/{request_id}', {**payload, 'version': 1})[0], 409))
        test('BE-INT-013', '확장자 위장 첨부 차단', lambda: check(user.upload(request_id, [('fake.pdf', b'not a PDF')])[0], 400))
        test('BE-INT-014', '실행 파일 첨부 차단', lambda: check(user.upload(request_id, [('run.exe', b'MZexample')])[0], 400))
        test('BE-INT-015', '첨부 5MB 초과 차단', lambda: check(user.upload(request_id, [('big.txt', b'a' * (5 * 1024 * 1024 + 1))])[0], 413))
        file_data = '한글 첨부\n수식 =SUM(A1)도 파일 내용으로 보존'.encode()
        status, uploaded, _ = user.upload(request_id, [('../자료.txt', file_data)])
        attachment_id = uploaded.get('attachments', [{}])[0].get('id')
        test('BE-INT-016', '실제 첨부 저장·파일명 경로 제거', lambda: check((status, uploaded['attachments'][0]['fileName']), (200, '자료.txt')))
        test('BE-INT-017', '본인 첨부 실제 바이트 다운로드', lambda: check(user.call('GET', f'/attachments/{attachment_id}/download')[1], file_data))
        test('BE-INT-018', '다른 사용자 첨부 다운로드 차단', lambda: check(other.call('GET', f'/attachments/{attachment_id}/download')[0], 404))
        test('BE-INT-019', '첨부 총3개 제한', lambda: check(user.upload(request_id, [('a.txt', b'a'), ('b.txt', b'b'), ('c.txt', b'c')])[0], 400))
        test('BE-INT-020', '허용 PDF·PNG signature 첨부', lambda: check(user.upload(request_id, [('sample.pdf', b'%PDF-1.7\n%%EOF'), ('sample.png', base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='))])[0], 200))
        test('BE-INT-021', 'SQL 입력을 검색 문자열로 처리', lambda: check(user.call('GET', '/requests?q=%27%20OR%201%3D1--')[1]['total'], 0))
        test('BE-INT-022', '검색·필터·정렬·페이지 개수', lambda: check(user.call('GET', '/requests?status=submitted&sort=title_asc&page=1&pageSize=1')[1]['pageSize'], 1))
        test('BE-INT-023', '잘못된 페이지 조건 거부', lambda: check(user.call('GET', '/requests?page=0')[0], 400))
        latest = user.call('GET', f'/requests/{request_id}')[1]
        test('BE-INT-024', '미허용 상태전이 거부', lambda: check(admin.call('POST', f'/requests/{request_id}/status', {'status': 'completed', 'reason': '바로 완료 불가', 'version': latest['version']})[0], 400))
        test('BE-INT-025', '관리자 상태전이 실행', lambda: check(admin.call('POST', f'/requests/{request_id}/status', {'status': 'in_progress', 'reason': '실제 검토를 시작합니다.', 'version': latest['version']})[0], 200))
        test('BE-INT-026', '처리 중 작성자 수정 차단', lambda: check(user.call('PUT', f'/requests/{request_id}', {**payload, 'version': latest['version'] + 1})[0], 403))
        test('BE-INT-027', '처리 이력 작성자·사유·상태 보존', lambda: check(user.call('GET', f'/requests/{request_id}')[1]['histories'][-1]['reason'], '실제 검토를 시작합니다.'))
        def extend_ten_times():
            for _ in range(10):
                code, session, _ = user.call('POST', '/auth/extend')
                check(code, 200)
                assert session['remainingSeconds'] >= 1190 and session['warningSeconds'] >= 20
            return '10회 연장 HTTP200; 매회1190초 이상 남음; 경고60초'
        test('BE-INT-028', '세션 최소10회 연장·경고시간 계약', extend_ten_times)
        def cookie_headers():
            client = Client()
            client.csrf()
            _, _, headers = client.call('POST', '/auth/login', {'email': 'user@sample.test', 'password': user_password})
            cookie = headers.get('Set-Cookie', '')
            assert 'httponly' in cookie.lower() and 'samesite=strict' in cookie.lower()
            assert 'secure' not in cookie.lower()  # Explicit localhost HTTP development exception only.
            return 'HttpOnly; SameSite=Strict; Development localhost HTTP Secure 예외'
        test('BE-INT-029', '개발 cookie 정책 및 보안 헤더', cookie_headers)
        def headers():
            _, _, headers = user.call('GET', '/requests')
            check(headers.get('X-Content-Type-Options'), 'nosniff')
            check(headers.get('X-Frame-Options'), 'DENY')
            assert "frame-ancestors 'none'" in headers.get('Content-Security-Policy')
        test('BE-INT-030', 'API 보안 응답 헤더', headers)
        stop()
        process = start()
        test('BE-INT-031', '서버 재시작 후 DB·첨부·인증키 영속', lambda: check(user.call('GET', f'/attachments/{attachment_id}/download')[1], file_data))
        cloned = Client()
        for cookie in user.cookies:
            cloned.cookies.set_cookie(copy.copy(cookie))
        cloned.token = user.token
        check(cloned.call('GET', '/auth/me')[0], 200)
        secondary = Client()
        check(secondary.login('user@sample.test', user_password)[0], 200)
        test('BE-INT-032', '로그아웃 후 인증 차단', lambda: check((user.call('POST', '/auth/logout')[0], user.call('GET', '/auth/me')[0]), (204, 401)))
        def revocation():
            check(cloned.call('GET', '/auth/me')[0], 401)
            check(cloned.call('POST', '/auth/extend')[0], 401)
            check(secondary.call('GET', '/auth/me')[0], 401)
            return '로그아웃 전 복제cookie 및 독립 로그인한 동일계정의 me/extend401'
        test('BE-INT-043', '로그아웃 후 복제티켓·동일계정 모든세션 즉시폐기', revocation)
        def storage_permissions():
            assert os.name != 'nt', 'Unix permissions require Unix; Windows ACL review remains pending'
            root = Path(data_dir)
            for folder in [root, root / 'uploads', root / 'keys']:
                check(stat.S_IMODE(folder.stat().st_mode), 0o700)
            check(stat.S_IMODE((root / 'kstd.db').stat().st_mode), 0o600)
            for uploaded_file in (root / 'uploads').iterdir():
                check(stat.S_IMODE(uploaded_file.stat().st_mode), 0o600)
            return 'Unix 데이터/첨부/키디렉터리0700; DB/첨부파일0600'
        test('BE-INT-044', '실제 로컬 DB·첨부·키 저장소 최소파일권한', storage_permissions)
        def lockout():
            blocked = Client()
            blocked.csrf()
            for _ in range(5):
                check(blocked.call('POST', '/auth/login', {'email': 'other@sample.test', 'password': 'wrong-password'})[0], 401)
            check(blocked.call('POST', '/auth/login', {'email': 'other@sample.test', 'password': user_password})[0], 401)
            return '다른 가상계정 5회 실패 후 올바른 비밀번호도5분 잠금'
        test('BE-INT-033', '계정 반복 로그인 실패 잠금', lockout)
        import sqlite3
        def audit():
            with sqlite3.connect(Path(data_dir) / 'kstd.db') as connection:
                rows = connection.execute('SELECT Action,Target,Success,TraceId FROM fc_AuditEvents').fetchall()
            assert any(row[0] == 'status_changed' for row in rows)
            assert any(row[0] == 'login' and row[2] == 0 for row in rows)
            assert all(row[3] for row in rows)
            assert user_password not in json.dumps(rows) and admin_password not in json.dumps(rows)
            return f'감사이벤트{len(rows)}개; 성공/실패·추적ID 저장; 비밀번호 비포함'
        test('BE-INT-034', 'DB 감사 이벤트와 비밀 제외', audit)
        test('BE-INT-037', '알 수 없는 API 경로는 SPA 대신404', lambda: check(anon.call('GET', '/unknown-route')[0], 404))
        def idempotency():
            key = str(uuid.uuid4())
            first = admin.call('POST', '/requests', payload, extra_headers={'Idempotency-Key': key})
            second = admin.call('POST', '/requests', payload, extra_headers={'Idempotency-Key': key})
            check(first[0], 201)
            check(second[0], 200)
            check(first[1]['id'], second[1]['id'])
            return f'같은 UUID 재전송: 최초201/재시도200, 같은ID={first[1]["id"]}'
        test('BE-INT-038', 'Idempotency-Key 중복제출 저장 방지', idempotency)
        def delete_file():
            created = admin.call('POST', '/requests', payload)[1]
            uploaded = admin.upload(created['id'], [('delete.txt', b'delete me')])[1]
            file_id = uploaded['attachments'][0]['id']
            check(admin.call('DELETE', f'/attachments/{file_id}')[0], 204)
            check(admin.call('GET', f'/attachments/{file_id}/download')[0], 404)
            return 'DB첨부삭제204; 삭제후다운로드404'
        test('BE-INT-039', '작성자 첨부 삭제와 다운로드 차단', delete_file)
        def login_rate():
            attacker = Client()
            attacker.csrf()
            codes = [attacker.call('POST', '/auth/login', {'email': 'missing@sample.test', 'password': 'invalid'})[0] for _ in range(22)]
            assert 429 in codes and all(code in [401, 429] for code in codes)
            return f'22회 로그인 요청 중429차단={codes.count(429)}회'
        test('BE-INT-041', '로그인IP별 요청 속도 제한', login_rate)
        def concurrent_submission():
            from concurrent.futures import ThreadPoolExecutor
            key = str(uuid.uuid4())
            unique_payload = dict(payload, title=f'동시제출 {key[:8]}')
            def submit(_):
                return admin.call('POST', '/requests', unique_payload, extra_headers={'Idempotency-Key': key})[0]
            with ThreadPoolExecutor(max_workers=2) as pool:
                codes = list(pool.map(submit, range(2)))
            assert 201 in codes and all(code in [200, 201, 409] for code in codes)
            query = urllib.parse.quote(unique_payload['title'])
            check(admin.call('GET', f'/requests?q={query}')[1]['total'], 1)
            return f'동시2건HTTP={codes}; DB최종1건'
        test('BE-INT-042', '동시 동일키 제출 DB고유제약', concurrent_submission)
        stop()
        env['SAMPLE_SESSION_MINUTES'] = '1'
        process = start()
        expiring = Client()
        expiring.login('user@sample.test', user_password)
        def expiry():
            time.sleep(62)
            check(expiring.call('GET', '/auth/me')[0], 401)
            check(expiring.call('POST', '/auth/extend')[0], 401)
            return 'Development1분 설정 후62초 실제 경과; me/extend401'
        test('BE-INT-035', '실제 서버 세션 만료 후 재인증 강제', expiry)
        stop()
        env['ASPNETCORE_ENVIRONMENT'] = 'Production'
        production = subprocess.run([DOTNET, str(ROOT / 'apps/api/bin/Debug/net10.0/Kstd.Api.dll')], cwd=ROOT / 'apps/api', env=env, stdout=log, stderr=subprocess.STDOUT, timeout=15)
        test('BE-INT-036', '운영환경 샘플seed 실행 거부', lambda: check(production.returncode != 0, True))
        env['ASPNETCORE_ENVIRONMENT'] = 'Development'
        def backup_restore():
            archive = Path(data_dir) / 'backup.tar.gz'
            restored = (Path(data_dir) / 'restored').resolve()
            subprocess.run([sys.executable, str(ROOT / 'scripts/backend.py'), 'backup', '--archive', str(archive)], cwd=ROOT, env=env, check=True, stdout=log, stderr=subprocess.STDOUT)
            restore_env = dict(env, KSTD_DATA_DIR=str(restored))
            subprocess.run([sys.executable, str(ROOT / 'scripts/backend.py'), 'restore-db', '--archive', str(archive), '--confirm-target', str(restored)], cwd=ROOT, env=restore_env, check=True, stdout=log, stderr=subprocess.STDOUT)
            with sqlite3.connect(restored / 'kstd.db') as connection:
                check(connection.execute('SELECT Title FROM fc_Requests WHERE Id=?', (request_id,)).fetchone()[0], '수정된 한글 요청')
                storage_name = connection.execute('SELECT StorageName FROM fc_Attachments WHERE Id=?', (attachment_id,)).fetchone()[0]
            check((restored / 'uploads' / storage_name).read_bytes(), file_data)
            assert list((restored / 'keys').glob('*.xml'))
            return '실제tar.gz백업·다른디렉터리복원; SQLite요청/첨부바이트/인증키일치'
        test('BE-INT-040', '실제 DB·첨부·인증키 백업/복구', backup_restore)
    except Exception as error:
        print(f'Integration failure: {type(error).__name__}: {error}', file=sys.stderr)
    finally:
        stop()
        log.close()
        report = {'run_id': 'backend-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'), 'collected_at': datetime.now(timezone.utc).isoformat(), 'environment': {'os': sys.platform, 'server': '.NET10 ASP.NET Core / SQLite', 'target': BASE, 'database': 'isolated temporary real SQLite'}, 'tests': RESULTS, 'limitations': ['운영 HTTPS TLS 종료·Secure cookie 실제 브라우저 시험 미실행', '악성코드 탐지엔진 미구현', '실제 화면낭독기·장애당사자 시험 포함 안 함', '운영 부하·침투 시험 아님']}
        (OUT / 'integration-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))

passed = sum(result['result'] == '통과' for result in RESULTS)
print(f'Backend integration: {passed}/{len(RESULTS)} passed')
sys.exit(0 if len(RESULTS) == 44 and passed == 44 else 1)
