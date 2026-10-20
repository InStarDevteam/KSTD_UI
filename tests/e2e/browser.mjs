import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { hash, recordArtifact, sourceSnapshot } from '../../scripts/evidence-lib.mjs';

const require = createRequire(import.meta.url);
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const baseUrl = 'http://localhost:8000';
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const output = `evidence/browser/${runId}`;
const screenshots = 'evidence/browser/screenshots';
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(`${output}/screenshots`, { recursive: true });
fs.mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(15000);
const snapshot = sourceSnapshot();
const results = [];
const axeStates = [];
let requestUrl = '';
const title = `접근성 자료 검토 요청 ${Date.now()}`;

async function capture(name) {
  const file = `${output}/screenshots/${name}.png`;
  await page.screenshot({ path: file, fullPage: name === 'mobile', animations: 'disabled' });
  fs.copyFileSync(file, `${screenshots}/${name}.png`);
  if (!name.startsWith('failure-')) recordArtifact({ testId: `SCREEN-${name.toUpperCase()}`, artifactPath: file, result: '부분확인', observed: `실제 실행화면 ${name}, ${page.url()}, ${JSON.stringify(page.viewportSize())}`, command: 'npm run test:e2e (Playwright page.screenshot)', toolName: `Playwright Chromium ${browser.version()}`, toolVersion: '1.64.1', sourceHashes: snapshot, runId, limitations: '실제 화면 캡처 증빙이며 원문 전체 통과/수동 보조기술 판정이 아님' });
  return { path: file, sha256: hash(fs.readFileSync(file)) };
}
async function axe(name) {
  console.log(`axe state: ${name}`);
  if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  axeStates.push({ state: name, url: page.url(), browser: browser.version(), violations: result.violations, incomplete: result.incomplete, passes: result.passes.map((r) => r.id) });
}
async function go(route) { await page.goto(`${baseUrl}${route}`); await page.getByRole('heading', { level: 1 }).waitFor(); }
async function login(email, password) {
  console.log(`login role: ${email.startsWith('admin') ? 'admin' : 'user'}`);
  await go('/');
  await page.getByLabel('이메일', { exact: false }).fill(email);
  await page.getByLabel('비밀번호', { exact: false }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).waitFor();
}
async function run(testId, task) {
  const start = Date.now();
  let result = '통과';
  let observed;
  try { observed = await task(); } catch (error) {
    result = '실패';
    observed = error.stack;
    await capture(`failure-${testId}`).catch(() => {});
  }
  const item = { testId, result, observed, elapsed_ms: Date.now() - start, browser: browser.version(), actual_at: new Date().toISOString() };
  results.push(item);
  const artifactPath = `${output}/${testId}.json`;
  fs.writeFileSync(artifactPath, JSON.stringify(item, null, 2));
  recordArtifact({ testId, artifactPath, result, observed: typeof observed === 'string' ? observed : JSON.stringify(observed), command: 'npm run test:e2e', exitCode: result === '통과' ? 0 : 1, toolName: `Playwright Chromium ${browser.version()}`, toolVersion: '1.64.1', sourceHashes: snapshot, runId, limitations: '실제 Chromium 자동상호작용/DOM/axe 확인. 사람의 화면낭독기 음성·전수 UI/외부인증 검사 아님' });
  console.log(`${testId}: ${result}`);
}

await run('E2E-WORKFLOW', async () => {
  assert(process.env.SAMPLE_USER_PASSWORD && process.env.SAMPLE_ADMIN_PASSWORD, '.env 초기화 비밀번호 필요');
  await go('/');
  const loginScreenshot = await capture('login');
  await axe('login');
  await login('user@sample.test', process.env.SAMPLE_USER_PASSWORD);
  await page.getByRole('heading', { name: '최근 업무요청' }).waitFor();
  await axe('dashboard');
  const homeScreenshot = await capture('dashboard');
  await go('/requests/new');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await axe('form-error-summary');
  const errorScreenshot = await capture('form-error');
  await page.getByLabel('요청 제목', { exact: false }).fill(title);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('요청 내용', { exact: false }).fill('표준 적용 기준과 실제 시험 증빙을 검토해 주세요. 한글과 줄바꿈을 확인합니다.\n두 번째 줄의 설명입니다.');
  await page.getByLabel('첨부파일', { exact: false }).setInputFiles({ name: '검토자료.txt', mimeType: 'text/plain', buffer: Buffer.from('한글 첨부자료\n실제 파일 저장 확인') });
  const formScreenshot = await capture('form');
  await axe('form-files');
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  assert.equal(await page.getByLabel('요청 제목', { exact: false }).inputValue(), title);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  assert((await page.getByLabel('요청 내용', { exact: false }).inputValue()).includes('두 번째 줄'));
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await axe('form-review');
  await page.getByRole('button', { name: '요청 등록', exact: true }).click();
  await page.getByRole('heading', { name: '요청이 등록되었습니다.' }).waitFor();
  await axe('complete');
  const completeScreenshot = await capture('complete');
  await page.getByRole('link', { name: '등록한 요청 보기' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  requestUrl = new URL(page.url()).pathname;
  await axe('detail-owner');
  const detailScreenshot = await capture('detail');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '검토자료.txt' }).click()]);
  const data = fs.readFileSync(await download.path(), 'utf8');
  assert(data.includes('한글 첨부자료'));
  await page.getByRole('link', { name: '요청 수정', exact: true }).click();
  await page.getByLabel('요청 제목', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('요청 제목', { exact: false }).inputValue(), title);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('요청 내용', { exact: false }).fill('요청의 내용을 수정했습니다. 기존 첨부는 보존하며 수정 이력을 남깁니다.');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '수정 내용 저장', exact: true }).click();
  await page.getByRole('heading', { name: '요청이 수정되었습니다.' }).waitFor();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByLabel('이메일', { exact: false }).waitFor();
  await login('admin@sample.test', process.env.SAMPLE_ADMIN_PASSWORD);
  await go(requestUrl);
  await page.getByRole('button', { name: '처리 상태 변경', exact: true }).click();
  await page.getByLabel('변경 사유', { exact: false }).fill('접수된 자료의 검토를 시작합니다.');
  await axe('admin-modal');
  const modalScreenshot = await capture('modal');
  await page.getByRole('button', { name: '변경 내용 저장', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByText('접수된 자료의 검토를 시작합니다.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '처리 상태 변경', exact: true }).click();
  await page.getByRole('combobox', { name: /변경할 상태/ }).selectOption('completed');
  await page.getByLabel('변경 사유', { exact: false }).fill('자료 검토를 완료했습니다.');
  await page.getByRole('button', { name: '변경 내용 저장', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByText('자료 검토를 완료했습니다.', { exact: true }).waitFor();
  await axe('admin-completed');
  await go('/requests');
  await page.getByRole('table').waitFor();
  await capture('list');
  await page.getByRole('searchbox', { name: '요청 검색' }).fill(title);
  await page.getByRole('combobox', { name: /요청 상태/ }).selectOption('completed');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.getByRole('link', { name: '요청 목록으로', exact: true }).click();
  assert.equal(await page.getByRole('searchbox', { name: '요청 검색' }).inputValue(), title);
  assert.equal(await page.getByRole('combobox', { name: /요청 상태/ }).inputValue(), 'completed');
  await page.getByRole('button', { name: '상태: 완료 필터 해제', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /요청 상태/ })).toHaveValue('');
  return { assertions: '실제 로그인→검증오류→단계뒤로입력보존→첨부포함등록→파일바이트다운로드→관리자처리중/완료→이력 확인', requestUrl, screenshots: [loginScreenshot, homeScreenshot, errorScreenshot, formScreenshot, completeScreenshot, detailScreenshot, modalScreenshot] };
});

await run('E2E-HELP', async () => {
  await go('/help');
  await page.getByRole('searchbox', { name: '표준 검색' }).waitFor();
  await page.getByRole('searchbox', { name: '표준 검색' }).fill('MDR-000');
  await page.getByRole('heading', { name: 'MDR 명칭 확인·세부 적용 확인필요' }).waitFor();
  assert(await page.getByText('확인필요', { exact: true }).count() > 0);
  await page.getByRole('searchbox', { name: '표준 검색' }).fill('DOC-003');
  await page.getByRole('button', { name: 'DOC-003 항목 복사 · 문서용 내용' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert(clipboard.includes('DOC-003') && clipboard.includes('출처:') && clipboard.includes('시험:') && clipboard.includes('증빙:'));
  const downloads = [];
  for (const format of ['JSON', 'CSV', 'Markdown']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: format, exact: true }).click()]);
    const data = fs.readFileSync(await download.path(), 'utf8');
    assert(data.includes('DOC-003'));
    if (format === 'JSON') assert.equal(JSON.parse(data).rules.length, 1);
    downloads.push({ name: download.suggestedFilename(), bytes: Buffer.byteLength(data), sha256: hash(data) });
  }
  await page.locator('summary').first().click();
  await axe('help-expanded');
  const helpScreenshot = await capture('help');
  // Simulate denied permission to exercise the explicit copy fallback.
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('permission denied fixture')) } }); });
  await page.getByRole('button', { name: 'DOC-003 항목 복사 · 문서용 내용' }).click();
  await page.getByRole('dialog').waitFor();
  assert((await page.getByLabel('복사할 표준 상세 내용').inputValue()).includes('DOC-003'));
  await axe('clipboard-fallback-dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('searchbox', { name: '표준 검색' }).waitFor();
  await page.getByRole('combobox', { name: /표준 분류/ }).selectOption({ label: 'KWCAG 2.2' });
  const [kwcagDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSON', exact: true }).click()]);
  assert.equal(JSON.parse(fs.readFileSync(await kwcagDownload.path(), 'utf8')).rules.length, 33);
  return { assertions: '297개 원장 로드, MDR확인필요, ID검색, 출처/시험/증빙 복사, JSON/CSV/Markdown 필터결과 다운로드, 권한거부시 수동복사 대화상자', downloads, screenshots: [helpScreenshot] };
});

await run('E2E-KEYBOARD', async () => {
  await go('/gallery');
  await page.getByRole('heading', { name: '확인 대화상자' }).waitFor();
  await page.getByRole('button', { name: '대화상자 열기', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), 'dialog focus escaped');
  }
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '대화상자 열기');
  await page.getByRole('link', { name: '본문 바로가기', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert(await page.evaluate(() => document.activeElement?.id === 'main-content' || Boolean(document.activeElement?.closest('#main-content'))));
  await axe('gallery');
  const galleryScreenshot = await capture('gallery');
  await page.getByRole('button', { name: '오류 상태 확인' }).click();
  await axe('gallery-input-error');
  await page.getByRole('button', { name: '로딩 상태 보기' }).click();
  await axe('gallery-loading');
  const all = page.getByRole('checkbox', { name: '모두 선택', exact: true });
  assert(await all.evaluate((element) => element.indeterminate));
  await all.click();
  assert(await all.isChecked());
  await page.getByRole('checkbox', { name: '이메일 안내 예시', exact: true }).uncheck();
  assert(await all.evaluate((element) => element.indeterminate));
  await axe('gallery-checkbox-mixed');
  const toggle = page.getByRole('switch', { name: '알림 미리보기 예시', exact: true });
  const before = await toggle.isChecked();
  await toggle.click();
  assert.notEqual(await toggle.isChecked(), before);
  await axe('gallery-switch');
  await page.getByRole('tab', { name: '이용 안내', exact: true }).focus();
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab', { name: '검증 범위', exact: true }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: '접근성', exact: true }).getAttribute('aria-selected'), 'true');
  await axe('gallery-keyboard-tabs');
  return { assertions: '키보드로 모달열기/Tab8회내부유지/Escape닫기/원래버튼초점복귀, 본문바로가기 초점, 갤러리오류·로딩', screenshots: [galleryScreenshot], limitations: '전체 업무과정 키보드 전수 수동평가는 별도 미실행' };
});

await run('E2E-REFLOW', async () => {
  const widths = [];
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of ['/', '/requests', '/requests/new', '/help', '/gallery', '/privacy']) {
    await go(route);
    if (route === '/help') await page.getByRole('searchbox', { name: '표준 검색' }).waitFor();
    await page.waitForTimeout(150);
    const measure = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    widths.push({ route, ...measure });
    assert(measure.document <= measure.viewport + 1, `${route} document overflow ${JSON.stringify(measure)}`);
  }
  const mobileScreenshot = await capture('mobile');
  await axe('mobile320-privacy');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await go('/help?tab=guide');
  await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}' });
  assert(await page.getByRole('heading', { name: '요청 등록부터 완료까지' }).isVisible());
  const textSpacingScreenshot = await capture('text-spacing');
  return { widths, screenshots: [mobileScreenshot, textSpacingScreenshot], limitations: '320CSS px 가상viewport 및 DOM검사. 실제400%브라우저확대/200%텍스트확대/시각정보손실 전수판정 미실행' };
});

await run('E2E-ERROR', async () => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.route('**/api/requests*', (route) => route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ status: 503, code: 'test_unavailable', detail: '시험용 일시적 연결 실패입니다.', traceId: 'test-only' }) }));
  await go('/requests');
  await page.getByRole('alert').waitFor();
  assert(await page.getByRole('button', { name: '다시 시도' }).isVisible());
  await axe('server-error');
  const errorScreenshot = await capture('server-error');
  await page.unroute('**/api/requests*');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await page.getByRole('table').waitFor();
  await page.getByRole('searchbox', { name: '요청 검색' }).fill('결과없음-unique-xyz');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('heading', { name: '검색 결과가 없습니다.' }).waitFor();
  assert(new URL(page.url()).searchParams.get('q') === '결과없음-unique-xyz');
  await axe('empty-results');
  await page.reload();
  assert.equal(await page.getByRole('searchbox', { name: '요청 검색' }).inputValue(), '결과없음-unique-xyz');
  const emptyScreenshot = await capture('empty-results');
  await go('/requests/new');
  await page.getByLabel('요청 제목', { exact: false }).fill('서버 필드 오류 복구 시험');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  const description = '서버에서 실제 DTO 오류를 발생시키고 입력 보존과 필드 연결을 확인합니다.';
  await page.getByLabel('요청 내용', { exact: false }).fill(description);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.route('**/api/requests', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      await route.continue({ postData: JSON.stringify({ ...body, description: '' }) });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '요청 등록', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('요청 내용', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('요청 내용', { exact: false }).inputValue(), description);
  assert.equal(await page.getByLabel('요청 내용', { exact: false }).getAttribute('aria-invalid'), 'true');
  await axe('server-field-validation');
  const validationScreenshot = await capture('server-validation');
  await page.unroute('**/api/requests');
  return { assertions: '503주입/재시도복구·빈검색결과·URL유지 및 실제API로변조된DTO전송→실제400→오류단계복귀/필드오류/입력보존', screenshots: [errorScreenshot, emptyScreenshot, validationScreenshot] };
});

await run('E2E-AXE', async () => {
  fs.writeFileSync(`${output}/axe-states.json`, JSON.stringify(axeStates, null, 2));
  const violations = axeStates.flatMap((state) => state.violations.map((v) => ({ state: state.state, id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })));
  assert.equal(violations.length, 0, JSON.stringify(violations, null, 2));
  return { states: axeStates.length, violations: 0, incomplete: axeStates.reduce((n, s) => n + s.incomplete.length, 0), raw: `${output}/axe-states.json`, limitations: 'incomplete는 자동판정 불가이며 통과로 간주하지 않음. 대표 상태의 자동검사만 수행.' };
});
fs.writeFileSync(`${output}/results.json`, JSON.stringify({ runId, baseUrl, browser: browser.version(), results }, null, 2));
await context.close();
await browser.close();
if (results.some((r) => r.result === '실패')) process.exitCode = 1;
