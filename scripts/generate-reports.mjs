/** Rebuild reviewable reports from the immutable rule, application, test and evidence ledgers. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'tmp/artifacts');
const out = path.join(root, 'reports');
const runtime = process.env.CODEX_ARTIFACT_RUNTIME || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
process.env.RUNTIME_NODE_MODULES ??= path.join(runtime,'node/node_modules');
await fs.mkdir(build, {recursive:true});
await fs.mkdir(out, {recursive:true});
try { await fs.access(path.join(build,'node_modules')); } catch {
  await fs.symlink(path.join(runtime,'node/node_modules'),path.join(build,'node_modules'),'dir');
}
const runtimeRequire = createRequire(path.join(build,'package.json'));
const {Workbook,SpreadsheetFile,Presentation,PresentationFile} = await import(pathToFileURL(runtimeRequire.resolve('@oai/artifact-tool')).href);
const font='Arial';
const navy='#142C48';
const muted='#53667E';
const asText=v=>v===null||v===undefined?'':Array.isArray(v)?v.join('\n'):typeof v==='object'?JSON.stringify(v):String(v);
function safe(v){
  if(typeof v!=='string')return v;
  let first=0;
  while(first<v.length&&(v.charCodeAt(first)<=32||/\s/u.test(v.charAt(first))))first++;
  return /^[=+\-@]/u.test(v.slice(first))||/^[\t\r\n]/u.test(v)?`'${v}`:v;
}
const short=(v,n=130)=>{const s=asText(v).replace(/\s+/g,' ');return s.length>n?s.slice(0,n-1)+'…':s;};
const esc=v=>asText(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const exists=async p=>{try {await fs.access(path.join(root,p));return true;}catch{return false;}};
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const statusValues=['미실행','통과','실패','부분확인','해당없음'];
const formulaAt=row=>`=IF(AND(M${row}="적용",V${row}="구현",X${row}<>"",Y${row}<>"",AB${row}<>"",AC${row}>0,AD${row}>0,AE${row}="통과",AF${row}="",AG${row}<>"",AH${row}<>"",OR(S${row}="자동",S${row}="수동",S${row}="자동+수동"),IF(OR(S${row}="자동",S${row}="자동+수동"),Z${row}="통과",TRUE),IF(OR(S${row}="수동",S${row}="자동+수동"),AA${row}="통과",TRUE)),"통과",IF(OR(Z${row}="실패",AA${row}="실패",AE${row}="실패"),"실패","보류"))`;

function styleSheet(sheet,title,note,rows,tableName,widths={}) {
  sheet.showGridLines=false;
  const last=col(rows[0].length-1),end=rows.length+5;
  sheet.getRange(`A2:${last}2`).format.font={name:font,size:16,bold:true,color:navy};
  sheet.getRange('A2').values=[[title]];
  sheet.getRange('A3').values=[[note]];
  sheet.getRange(`A3:${last}3`).format.font={name:font,size:10,color:muted};
  sheet.getRange(`A6:${last}${end}`).values=rows.map(row=>row.map(v=>safe(v??'')));
  const data=sheet.getRange(`A6:${last}${end}`);
  data.format.font={name:font,size:11,color:navy};
  data.format.wrapText=true;
  data.format.verticalAlignment='top';
  data.format.columnWidth=23;
  data.format.rowHeight=62;
  sheet.getRange(`A6:${last}6`).format={fill:navy,font:{name:font,size:11,color:'#FFFFFF',bold:true},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:42,wrapText:true};
  if(rows.length>1){
    const table=sheet.tables.add(`A6:${last}${end}`,true,tableName);
    table.style='TableStyleMedium2';table.showFilterButton=true;
  }
  for(const [c,w] of Object.entries(widths))sheet.getRange(`${c}6:${c}${end}`).format.columnWidth=Number(w);
  if(rows.length>1)sheet.getRange(`A7:${last}${end}`).format.autofitRows();
  sheet.freezePanes.freezeRows(6);sheet.freezePanes.freezeColumns(1);
  return end;
}
function statusFormat(range) {
  for(const [text,fill,color] of [['실패','#FEE2E2','#991B1B'],['미실행','#FEF3C7','#854D0E'],['확인필요','#FEF3C7','#854D0E'],['부분확인','#E0E7FF','#3730A3'],['보류','#FEF3C7','#854D0E']])
    range.conditionalFormats.add('containsText',{text,format:{fill,font:{color,bold:true}}});
}
async function formulaFixtures() {
  for(const value of ['=SUM(A1:A2)',' +CMD','\n=HYPERLINK()','\t@SUM(A1)','\u0000\r -1','\rplain'])if(!safe(value).startsWith("'"))throw new Error('Fixture: spreadsheet formula injection guard');
  if(safe('  정상 한글 문장')!=='  정상 한글 문장')throw new Error('Fixture: safe text preservation');
  // A disposable fixture proves the same completion formula reacts to edits.
  const wb=Workbook.create();const s=wb.worksheets.add('Fixture');
  s.getRange('A1:AK2').values=[Array(37).fill(''),Array(37).fill('')];
  const cells={M1:'적용',V1:'구현',X1:'fixture.js#fixture',Y1:'FIXTURE-001',AB1:'FIXTURE-EVIDENCE',AC1:1,AD1:1,AE1:'통과',AF1:'',AG1:'FIXTURE-REVIEWER',AH1:'2000-01-01T00:00:00Z',S1:'자동+수동',Z1:'통과',AA1:'통과'};
  for(const [a,v] of Object.entries(cells))s.getRange(a).values=[[v]];
  s.getRange('AJ1').formulas=[[formulaAt(1)]];
  s.getRange('A4').formulas=[['=COUNTIFS(AJ1:AJ2,"통과")']];
  s.getRange('A5').formulas=[['=IF(COUNTIFS(M1:M2,"조건부")=0,"산정대상 없음",1/COUNTIFS(M1:M2,"조건부"))']];
  wb.recalculate();
  if(s.getRange('AJ1').values[0][0]!=='통과'||s.getRange('A4').values[0][0]!==1)throw new Error('Fixture: completed item must count once');
  s.getRange('AB1').values=[['']];wb.recalculate();
  if(s.getRange('A4').values[0][0]!==0)throw new Error('Fixture: blank evidence incorrectly passes');
  s.getRange('AB1').values=[['FIXTURE-EVIDENCE']];s.getRange('AA1').values=[['미실행']];wb.recalculate();
  if(s.getRange('A4').values[0][0]!==0)throw new Error('Fixture: unexecuted manual test incorrectly passes');
  s.getRange('AA1').values=[['통과']];s.getRange('AF1').values=[['FIXTURE-DEVIATION']];wb.recalculate();
  if(s.getRange('A4').values[0][0]!==0)throw new Error('Fixture: deviation incorrectly passes');
  s.getRange('AF1').values=[['']];s.getRange('AG1').values=[['']];wb.recalculate();
  if(s.getRange('A4').values[0][0]!==0)throw new Error('Fixture: missing reviewer incorrectly passes');
  s.getRange('AG1').values=[['FIXTURE-REVIEWER']];s.getRange('AH1').values=[['']];wb.recalculate();
  if(s.getRange('A4').values[0][0]!==0)throw new Error('Fixture: missing review time incorrectly passes');
  if(s.getRange('A5').values[0][0]!=='산정대상 없음')throw new Error('Fixture: zero denominator');
  return {blank_evidence_blocks_pass:true,unexecuted_manual_blocks_pass:true,deviation_blocks_pass:true,missing_reviewer_blocks_pass:true,missing_review_time_blocks_pass:true,edit_recalculates:true,zero_denominator_distinguished:true,spreadsheet_injection_boundaries_checked:true};
}
if(process.argv.includes('--fixture-check')){console.log(JSON.stringify(await formulaFixtures()));process.exit(0);}

const [catalog,records,tests,evidence,summary,numbered,sections,interactions,sources,issues,scenarios] = await Promise.all([
  read('standards/catalog.json'),read('standards/application-records.json'),read('standards/tests.json'),process.argv.includes('--draft-no-evidence')?Promise.resolve([]):read('evidence/index.json'),read('standards/summary.json'),
  read('reference-package/krds_source_inventory.json'),read('reference-package/krds_section_index.json'),read('reference-package/krds_interaction_index.json'),
  read('standards/source-register.json'),read('reference-package/source_issues.json'),read('reference-package/accessibility_scenarios.json')
]);
const rules=catalog.rules;
const recordMap=new Map(records.map(x=>[x.rule_id,x]));
const testMap=new Map(tests.map(x=>[x.test_id,x]));
const evidenceMap=new Map(evidence.map(x=>[x.evidence_id,x]));
if(new Set(rules.map(x=>x.rule_id)).size!==rules.length)throw new Error('Duplicate rule IDs');
const evidenceValid=new Map();
for(const item of evidence){
  if(!item.artifact_path||!(await exists(item.artifact_path))){evidenceValid.set(item.evidence_id,false);continue;}
  const h=crypto.createHash('sha256').update(await fs.readFile(path.join(root,item.artifact_path))).digest('hex');
  evidenceValid.set(item.evidence_id,!!item.sha256&&h===item.sha256);
}
for(const rule of rules){
  const r=recordMap.get(rule.rule_id);if(!r)throw new Error(`Missing application record ${rule.rule_id}`);
  if(!r.test_refs?.length)throw new Error(`Missing test connection ${rule.rule_id}`);
  for(const id of r.test_refs)if(!testMap.has(id))throw new Error(`Unknown test ${id}`);
  for(const id of r.evidence_ids||[])if(!evidenceMap.has(id))throw new Error(`Unknown evidence ${id}`);
}
const merged=rules.map(rule=>({...rule,...recordMap.get(rule.rule_id)}));
const validCount=r=>(r.evidence_ids||[]).filter(id=>evidenceValid.get(id)).length;
const complete=r=>r.applicability==='적용'&&r.implementation_status==='구현'&&r.code_refs?.length&&r.test_refs?.length&&validCount(r)>0&&r.final_result==='통과'&&!r.deviation_id&&r.reviewer&&r.reviewed_at&&['자동','수동','자동+수동'].includes(r.required_verification)&&(!r.required_verification.includes('자동')||r.auto_result==='통과')&&(!r.required_verification.includes('수동')||r.manual_result==='통과');
const familyNames=[...new Set(rules.map(r=>r.family))];
const calculated=familyNames.map(family=>{
  const items=merged.filter(r=>r.family===family);
  return {family,total:items.length,applicable:items.filter(x=>x.applicability==='적용').length,conditional:items.filter(x=>x.applicability==='조건부').length,not_applicable:items.filter(x=>x.applicability==='해당없음').length,unconfirmed:items.filter(x=>x.applicability==='확인필요').length,implemented:items.filter(x=>x.applicability==='적용'&&x.implementation_status==='구현').length,verified:items.filter(complete).length};
});
for(const row of calculated){
  const expected=summary.families.find(x=>x.family===row.family);if(!expected)throw new Error(`Missing summary family ${row.family}`);
  for(const k of ['total','applicable','conditional','not_applicable','unconfirmed','implemented','verified'])if(Number(expected[k])!==row[k])throw new Error(`JSON summary mismatch: ${row.family}.${k} ${expected[k]} != ${row[k]}`);
}
const asOf=summary.as_of||catalog.meta.as_of;
const commit=summary.commit_sha||'';
const fixtureResults=await formulaFixtures();

const wb=Workbook.create();
const sheetNames=['01_요약','02_통합적용대장','03_접근성시험','04_KRDS원문항목','05_KRDS범위색인','06_출처변경관리'];
const sheets=sheetNames.map(n=>wb.worksheets.add(n));
const headers=['규칙 ID','표준군','세부 범주','항목명','요구사항','출처 ID','출처 판본','원문 절','원문 페이지','기준 계층','원문 요구수준','회사 요구수준','적용성','적용성 사유','재평가 조건','대상 화면','설계·적용 방법','검증 방법','필요 검증','담당 역할','우선순위','구현 상태','실제 구현 요약','구현 파일#심볼','시험 ID','자동 결과','수동 결과','증빙 ID','유효 증빙 수','연결 시험 수','원장 최종결과','편차 ID','검토자','검토 시각','원문검토 상태','검증완료 판정','원문 섹션 ID','관련 기준','추가 설명'];
const masterRows=[headers,...merged.map(r=>[r.rule_id,r.family,r.category,r.title,r.requirement,r.source_id,r.source_version,r.source_clause,r.source_page,r.reference_kind,r.source_requirement_level,r.company_level,r.applicability,r.applicability_reason,r.trigger_condition,r.target_screens,r.planned_implementation,r.verification_method,r.required_verification,r.owner_role,r.priority,r.implementation_status,r.implementation_summary,asText(r.code_refs),asText(r.test_refs),r.auto_result,r.manual_result,asText(r.evidence_ids),validCount(r),(r.test_refs||[]).filter(t=>testMap.has(t)).length,r.final_result,r.deviation_id,r.reviewer,r.reviewed_at,r.source_review_status||'재확인필요','',r.source_section_id,r.related_ids||r.related_standard_criteria,r.notes].map(asText))];
// Counts remain numeric so filters and completion formulas use real numbers.
for(let i=1;i<masterRows.length;i++){masterRows[i][28]=validCount(merged[i-1]);masterRows[i][29]=(merged[i-1].test_refs||[]).filter(t=>testMap.has(t)).length;}
const end=styleSheet(sheets[1],'통합 표준 적용대장',`${asOf} / 회사 승인 전 / 자동·수동·증빙·편차 조건을 모두 충족한 항목만 검증완료로 집계`,masterRows,'StandardsRegister',{A:17,B:21,C:24,D:31,E:64,F:15,G:28,H:34,I:15,J:28,K:29,L:18,M:16,N:50,O:47,P:24,Q:58,R:58,S:18,T:20,U:13,V:16,W:64,X:70,Y:38,Z:16,AA:16,AB:45,AC:15,AD:15,AE:18,AF:18,AG:18,AH:25,AI:28,AJ:18,AK:25,AL:40,AM:60});
sheets[1].getRange(`AJ7:AJ${end}`).formulas=merged.map((_,i)=>[formulaAt(i+7)]);
for(const [c,values] of [['M',['적용','조건부','해당없음','확인필요']],['V',['계획','진행','구현','예외','해당없음']],['Z',statusValues],['AA',statusValues],['AE',statusValues],['S',['자동','수동','자동+수동']],['AI',['확인','재확인필요','미확인']]]){
  sheets[1].getRange(`${c}7:${c}${end}`).dataValidation={rule:{type:'list',values}};
  sheets[1].getRange(`${c}7:${c}${end}`).format.fill='#FFF9DE';
  statusFormat(sheets[1].getRange(`${c}7:${c}${end}`));
}
statusFormat(sheets[1].getRange(`AJ7:AJ${end}`));
const sumRows=[['표준군','관리행','적용 확정','조건부','해당없음','확인필요','구현','검증완료','구현률','검증완료율'],...calculated.map(r=>[r.family,...Array(9).fill('')])];
styleSheet(sheets[0],'회사 SW 표준 적용 결과',`기준 ${asOf} / commit ${commit.slice(0,12)||'미기록'} / 회사 승인 전 초안`,sumRows,'FamilySummary',{A:24,B:13,C:15,D:13,E:15,F:15,G:13,H:15,I:19,J:21});
const q="'02_통합적용대장'!";
for(let i=0;i<calculated.length;i++){
  const row=i+7,f=`$A${row}`;
  const formula=[`=COUNTIFS(${q}$B$7:$B$${end},${f})`,...['적용','조건부','해당없음','확인필요'].map(s=>`=COUNTIFS(${q}$B$7:$B$${end},${f},${q}$M$7:$M$${end},"${s}")`),`=COUNTIFS(${q}$B$7:$B$${end},${f},${q}$M$7:$M$${end},"적용",${q}$V$7:$V$${end},"구현")`,`=COUNTIFS(${q}$B$7:$B$${end},${f},${q}$AJ$7:$AJ$${end},"통과")`,`=IF(C${row}=0,"산정대상 없음",G${row}/C${row})`,`=IF(C${row}=0,"산정대상 없음",H${row}/C${row})`];
  sheets[0].getRange(`B${row}:J${row}`).formulas=[formula];
}
sheets[0].getRange('B7:H15').setNumberFormat('#,##0');sheets[0].getRange('I7:J15').setNumberFormat('0.0%');
sheets[0].getRange('A18').values=[['집계 방법']];sheets[0].getRange('A18').format.font={name:font,size:12,bold:true,color:navy};
const notes=[
  `관리행 ${rules.length}개는 중복을 포함하는 통합 관리단위입니다. 표준군을 합산한 단일 준수율은 산정하지 않습니다.`,
  '구현률 = 적용 확정 중 구현 / 적용 확정. 검증완료율 = 필요한 자동·수동 및 증빙을 모두 갖춘 통과 / 적용 확정.',
  '검증완료는 구현 파일·시험 ID·유효 증빙·원장 통과·검토자·검토시각 및 필요한 시험의 통과를 요구합니다. 미실행·부분확인·회사 편차는 통과에 포함하지 않습니다.',
  '02 시트 노란색 상태 필드는 편집할 수 있습니다. 요약은 해당 필드를 참조하는 수식입니다. 원장 JSON을 수정 후 reports 명령으로 재생성하면 Excel 편집은 덮어씁니다.',
  '유효 증빙 수는 생성 시 파일 존재와 SHA-256 일치를 검사한 값입니다. Excel에서 증빙 ID만 편집한 경우에는 JSON 원장과 증빙을 갱신하고 보고서를 재생성하세요.',
  `원문: KRDS 번호 후보 ${numbered.length}개, 구조 ${sections.length}개, 비번호 상호작용 ${interactions.length}쪽. 원문 전수 준수 증명이 아닙니다.`,
  ...(summary.limitations||[])
];
for(let i=0;i<notes.length;i++){sheets[0].mergeCells(`A${20+i*2}:J${21+i*2}`);sheets[0].getRange(`A${20+i*2}`).values=[[notes[i]]];sheets[0].getRange(`A${20+i*2}:J${21+i*2}`).format={font:{name:font,size:11,color:muted},wrapText:true,verticalAlignment:'center',rowHeight:24};}
sheets[0].freezePanes.unfreeze();

const originalScenarios=scenarios.filter(s=>!testMap.has(s.id)).map(s=>[s.id,'수동 대표과업',s.user_group,s.scenario,s.related_ids,s.steps,s.acceptance,s.environment,'미실행','원본은 시험계획이며 실제 수행 증빙이 없음','','','']);
const testRows=[['시험 ID','유형','사용 조건','시험명','연결 규칙','절차','예상 결과','환경·보조기술','판정','실제 관찰','증빙 ID','검사자','실행 시각'],...tests.map(t=>[t.test_id,t.type,t.user_group||'',t.title,asText(t.rule_ids),asText(t.steps),t.expected,asText(t.environment),t.status,t.observed,asText(t.evidence_ids),t.tester||'',t.executed_at||''].map(asText)),...originalScenarios];
const testEnd=styleSheet(sheets[2],'자동·수동 시험과 접근성 과업','원본 15개 대표과업 보존. 실제 실행한 개별 시험과 미실행 수동 절차를 구분합니다.',testRows,'VerificationTests',{A:23,B:18,C:27,D:46,E:40,F:75,G:65,H:45,I:17,J:68,K:50,L:20,M:26});
sheets[2].getRange(`I7:I${testEnd}`).dataValidation={rule:{type:'list',values:statusValues}};statusFormat(sheets[2].getRange(`I7:I${testEnd}`));

const rawRows=[['원문 후보 ID','원문 섹션','장','범주','절 제목','유형','번호','인쇄 페이지','PDF 실제 페이지','세부 페이지','원문 문장','원문 등급','원문검토 상태','통합 규칙 매핑','목록 성격'],...numbered.map(r=>[r.id,r.section_id,r.chapter,r.category,r.source_section,r.kind,r.source_item,r.source_page,r.source_pdf_page,asText(r.source_detail_pages),r.requirement,r.source_level,r.source_review_status,asText(r.linked_company_controls),'자동 추출 후보 / 공식 전수 체크리스트 아님'])];
styleSheet(sheets[3],'KRDS 번호별 원문 참조 후보',`${numbered.length}개 추출 후보를 전부 보존. 번호 없는 규칙과 원문 등급·예외의 전수 확인은 별도입니다.`,rawRows,'KrdsNumbered',{A:29,B:24,C:22,D:24,E:33,F:30,G:12,H:15,I:18,J:18,K:90,L:27,M:60,N:38,O:44});
const scopeRows=[['유형','원문 ID','장','범주·절','시작 인쇄쪽','종료쪽','PDF 실제쪽','번호 후보수','회사 통제','검토범위·동작','원문검토 상태'],...sections.map(s=>['목차·구조',s.id,s.chapter,`${s.category} / ${s.title}`,s.start_page,s.end_page,s.source_pdf_page,s.numbered_candidate_count,asText(s.company_controls),s.coverage_note,'재확인필요']),...interactions.map(s=>['비번호 상호작용',s.id,'',s.source_section,s.source_page,s.source_page,s.source_pdf_page,'',asText(s.company_controls),`${s.interaction_topics}\n${s.coverage_requirement}\n${s.note}`,s.status])];
styleSheet(sheets[4],'KRDS 구조와 비번호 상호작용',`구조 ${sections.length}개 및 상호작용 ${interactions.length}쪽 전체 색인. 섹션 연결은 세부기준 통과 증빙이 아닙니다.`,scopeRows,'KrdsScope',{A:24,B:28,C:26,D:45,E:18,F:15,G:18,H:18,I:38,J:115,K:55});
const sourceRows=[['구분','ID','표준·확인 제목','발행기관','판본','유형·등급','원문 URL·파일','원문 위치','확인일·수집일','접근·확인 상태','적용범위·영향·후속조치'],...sources.map(s=>['출처',s.source_id,s.title,s.publisher||s.organization||'',s.version,s.kind||s.reference_kind||'',s.url||s.local_file,s.source_clause||s.source_page||'',s.retrieved_at,s.access_status,s.scope]),...issues.map(i=>['원문 확인사항',i.id,i.issue,'','2025.08','원문 불일치·수정', 'references/ 원본 PDF',i.source_page,'', '재확인필요',i.handling]),['MDR 적용 확인','MDR-000','국방 메타데이터 관리시스템(MDR: Meta Data Registry) 명칭 확인','국방부','세부 원본 판본 확인필요','세부 기준 적용 확인필요','https://opendata.mnd.go.kr/openinf/sheetview2.jsp?infId=OA-9422','국방데이터 코드설계표준',asOf,'명칭 확인 / 세부 기준 확인필요','정식 명칭은 공식자료로 확인. 원본 코드표·사업 적용범위 미확보로 준수 판정 보류.'],['2025.08 변경','KRDS-CHANGE-01','운영기관 식별자','행정안전부','2025.08','원문 개정','references/ 원본 PDF','본문 229~231쪽 / 대비표 1쪽',asOf,'원문 확인','회사 브랜드 샘플에 정부 식별자를 사용하지 않음. 공공서비스 전환 때 재평가.'],['2025.08 변경','KRDS-CHANGE-02','개인정보 처리방침 명칭·강조','행정안전부','2025.08','원문 개정','references/ 원본 PDF','본문 249쪽 / 대비표 2쪽',asOf,'원문 확인','실제 연결 페이지와 명칭, 다른 고지와 시각적 구분을 확인.'],['2025.08 변경','KRDS-CHANGE-03','로그인 방식 목록 배치','행정안전부','2025.08','원문 권장','references/ 원본 PDF','본문 1007쪽 / 대비표 2쪽',asOf,'원문 확인','복수 로그인 방식 도입 시 사용자 관점 분류 및 배치 재평가.']];
styleSheet(sheets[5],'출처·원문 이상·2025.08 변경관리','법적 의무·외부 권고·회사 기준을 구분하고 출처와 원문 미확정 상태를 보존합니다.',sourceRows,'SourceChanges',{A:25,B:26,C:62,D:28,E:24,F:29,G:90,H:45,I:24,J:28,K:100});

wb.recalculate();
const actualSummary=sheets[0].getRange('A7:J15').values;
for(let i=0;i<calculated.length;i++){
  const f=calculated[i];const expected=[f.total,f.applicable,f.conditional,f.not_applicable,f.unconfirmed,f.implemented,f.verified];
  for(let j=0;j<7;j++)if(actualSummary[i][j+1]!==expected[j])throw new Error(`Excel summary mismatch ${f.family} column ${j+1}`);
}
const errorScan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:50},maxChars:4000});
await fs.writeFile(path.join(build,'xlsx-formula-scan.ndjson'),errorScan.ndjson);
if(/"value":"#(?:REF!|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!|SPILL!|CALC!)/.test(errorScan.ndjson))throw new Error('Unexpected Excel formula error');
for(let i=0;i<sheets.length;i++){
  const preview=await wb.render({sheetName:sheetNames[i],range:i===0?'A2:J15':i===1?'A6:F10':i===2?'A6:D10':i===3?'A6:F10':i===4?'A6:D10':'A6:E10',scale:1.25,format:'png'});
  await fs.writeFile(path.join(build,`xlsx-sheet-${i+1}.png`),new Uint8Array(await preview.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'Company_SW_Standards_Register.xlsx'));
try{await fs.rename(path.join(out,'Company_SW_Standards_Register.xlsx.inspect.ndjson'),path.join(build,'xlsx-export-inspect.ndjson'));}catch{}

const autoTests=tests.filter(t=>t.type==='자동');
const manualTests=tests.filter(t=>t.type==='수동');
const runCounts=list=>statusValues.map(s=>`${s} ${list.filter(t=>t.status===s).length}`).join(' / ');
const evidenceForTests=ts=>[...new Set(ts.flatMap(t=>t.evidence_ids||[]))].map(id=>evidenceMap.get(id)).filter(Boolean);
const screenshots=evidence.filter(e=>/^evidence\/browser\//.test(e.artifact_path||'')&&(e.artifact_path||'').includes('/screenshots/')&&/\.(png|jpg|jpeg)$/i.test(e.artifact_path||'')&&evidenceValid.get(e.evidence_id));
const imageData=new Map(await Promise.all(screenshots.map(async e=>[e.evidence_id,`data:${/\.png$/i.test(e.artifact_path)?'image/png':'image/jpeg'};base64,${(await fs.readFile(path.join(root,e.artifact_path))).toString('base64')}`])));
const selectedShots=new Set();
const shot=pattern=>{const e=screenshots.find(e=>!selectedShots.has(e.evidence_id)&&pattern.test(`${e.artifact_path} ${e.observed} ${e.test_id}`));if(e)selectedShots.add(e.evidence_id);return e;};
const caseFor=(ids)=>merged.filter(r=>ids.includes(r.rule_id));
const caseRows=items=>items.map(r=>[`${r.rule_id}\n${short(r.title,30)}`,short(asText((r.code_refs||[]).slice(0,2)),74),short(asText(r.test_refs),55),`${r.final_result||'미실행'}\n${short(asText(r.evidence_ids),55)}`]);
const selectedRules=(prefix,n=3)=>merged.filter(r=>r.rule_id.startsWith(prefix)&&r.code_refs?.length).sort((a,b)=>validCount(b)-validCount(a)).slice(0,n);
const testRowsFor=list=>list.slice(0,5).map(t=>[t.title===t.test_id?t.test_id:`${t.test_id}\n${short(t.title,45)}`,t.status,short(t.observed||'실제 실행 관찰 없음',110),short(asText(t.evidence_ids),65)]);
const taskResults=pattern=>tests.filter(t=>pattern.test(`${t.title} ${t.test_id}`)).sort((a,b)=>(b.type==='자동'?2:0)+(b.status!=='미실행'?1:0)-((a.type==='자동'?2:0)+(a.status!=='미실행'?1:0))).slice(0,4);
let codeSnippet='';
if(await exists('apps/api/BusinessRules.cs')){
  const source=await fs.readFile(path.join(root,'apps/api/BusinessRules.cs'),'utf8');
  codeSnippet=source.match(/if \(string\.IsNullOrWhiteSpace\(title\)[\s\S]*?\n\s*}/)?.[0].split('\n').map(line=>line.replace(/^ {8}/,'')).join('\n')||'';
}
const slideData=[];
const add=(title,subtitle,body={},sources=[])=>slideData.push({title,subtitle,...body,sources});
add('회사 SW 표준 적용 결과',`회사 브랜드 업무요청·첨부·처리현황 관리 / ${asOf}`,{cover:true,lines:[`commit ${commit||'미기록'}`,`기준안 v${catalog.meta.version} / 회사 승인 전 초안`, `필요한 자동·수동 확인의 검증완료 ${calculated.reduce((a,f)=>a+f.verified,0)}개 관리행. 표준별 집계는 16쪽 참조.`, 'MDR 세부 적용 확인필요. 화면낭독기·당사자 평가 미실행은 잔여사항으로 유지.']},['standards/summary.json','standards/application-records.json']);
add('적용 표준과 판본','외부 공식 기준과 회사 채택안을 구분합니다.',{headers:['기준','판본·범위','적용·검토 제한'],rows:[['KRDS UI/UX','첨부 2025.08 수정본 + 변경 대비표','725개 번호 후보와 103개 구조·52쪽 상호작용은 탐색 색인'],['KWCAG 2.2','KS X OT0003 / 33개 항목','독립 관리. 원문·보조기술 전수 확인 별도'],['WCAG 2.2','W3C A 31개 + AA 24개','전체 페이지·완결된 업무과정 판정 별도'],['개발·보안','C#/TypeScript, SSDF 1.1, 선택 ASVS 5.0.0','회사 MUST/SHOULD 제안과 출처 요구수준 구분'],['회사 운영 통제','기준안 0.1','외부 인증·전체 특정 등급 준수 주장 없음']]},['standards/catalog.json','standards/source-register.json']);
add('MDR 명칭 확인과 세부 기준 적용','MDR-000은 원본 코드표와 사업 적용범위의 확인필요 상태를 유지합니다.',{headers:['현재 정보','판정','후속 조건'],rows:[['MDR: Meta Data Registry','국방 메타데이터 관리시스템 명칭 확인','공식 법령·국방부 자료로 명칭 확인'],['국방데이터 코드설계표준','공식 목록 확인 / 원본 미확보','원본 코드표·세부 조항·판본 확보'],['현재 웹 샘플 적용범위','확인필요','해당 사업의 적용 요구·데이터 규칙 검토'],['준수 판정','보류 / 미검증','세부 기준을 별도 ID와 실제 시험에 연결']],note:'사용자 제공 국방부 공개데이터 링크를 반영했습니다. 공통 웹 표준의 구현·시험은 계속합니다.'},['standards/profiles/mdr-pending.json','MDR-000','https://opendata.mnd.go.kr/openinf/sheetview2.jsp?infId=OA-9422','https://www.data.go.kr/data/15083221/fileData.do?recommendDataYn=Y']);
add('시스템 구성과 업무흐름','로컬 웹·API·SQLite를 사용하는 샘플입니다.',{headers:['계층·역할','구현 범위','실행·데이터'],rows:[['웹 / S01~S08','로그인, 홈, 목록, 상세, 단계형 입력, 관리자, 도움말, 갤러리','http://localhost:8000'],['API / 서버 권한','인증·역할·소유권, 검증, 처리 이력, 첨부','http://localhost:8001 /api'],['영속 데이터','EF Core + SQLite / fc_ 접두어','요청·첨부·감사기록 서버 저장'],['일반 사용자','본인 요청 등록·조회·수정·첨부 다운로드','관리자 작업은 서버에서 제한'],['관리자','전체 목록과 허용된 상태변경·사유·이력','서버 동시수정·상태전이 제어']]},['docs/ARCHITECTURE.md','docs/RUNBOOK.md']);
add('표준·구현·시험·증빙 연결','코드와 시험 ID를 따라 실제 실행 증빙을 조회합니다.',{headers:['규칙','구현 파일#심볼','시험 ID','판정·증빙'],rows:caseRows([...selectedRules('SEC-',2),...selectedRules('UI-',1)]),note:'일부 자동 측면이 확인되어도 필요한 수동 확인이 남으면 조항 전체를 통과로 집계하지 않습니다.'},['standards/catalog.json','standards/application-records.json','evidence/index.json']);
const codeAuto=autoTests.filter(t=>/lint|format|type|build|unit|frontend|backend|정적|빌드|코딩|단위/i.test(`${t.title} ${t.test_id}`));
add('코딩규칙과 정적검사 실제 결과','언어별 설정과 실행 결과를 구분합니다.',{headers:['시험·검사','실행 결과','실제 관찰','증빙 ID'],rows:testRowsFor(codeAuto),codeSnippet,codePath:'apps/api/BusinessRules.cs#Validate',note:codeAuto.length?`연결 실행항목 ${codeAuto.length}개. 필요한 수동 리뷰가 남은 코딩 조항의 최종 판정은 보류입니다.`:'연결된 정적검사 실행 결과가 없습니다. 실행하지 않은 검사는 미실행입니다.'},[...evidenceForTests(codeAuto).map(e=>e.artifact_path),'apps/api/BusinessRules.cs#Validate']);
const secAuto=autoTests.filter(t=>/security|integration|auth|upload|api|backend|audit|workflow|보안|인가|통합|첨부/i.test(`${t.title} ${t.test_id}`));
add('보안 구현과 실패경로 시험','인증·객체 인가·업로드를 서버에서 통제합니다.',{headers:['시험·검사','실행 결과','실제 관찰','증빙 ID'],rows:testRowsFor(secAuto),note:'악성코드 검사 엔진·운영 HTTPS·배포환경 보안은 실제 도입·검증 전까지 미조치 또는 미검증으로 유지합니다.'},evidenceForTests(secAuto).map(e=>e.artifact_path));
add('KRDS 스타일과 공통 컴포넌트','브랜드·가독성·상태·초점 스타일을 공통 설정으로 관리합니다.',{image:shot(/gallery|갤러리|components|tokens/i),imageLabel:'실행한 컴포넌트 갤러리',lines:['회사 자체 브랜드를 사용하며 정부 공식 배너를 사용하지 않습니다.','본문 크기와 행간, 색·공간·초점을 공통 토큰으로 정의합니다.','일반·오류·비활성·로딩의 상태를 텍스트와 함께 제공합니다.'],cases:selectedRules('UI-',2)},['docs/UI_UX_STANDARD.md']);
add('2025.08 변경사항 반영','세부 위치와 섹션 시작 쪽을 구별합니다.',{headers:['변경','원문 세부 위치','샘플 적용·재평가'],rows:[['운영기관 식별자','본문 229~231쪽 / 대비표 1쪽','회사 샘플은 정부 식별자 제외. 공공서비스 전환 때 재평가'],['개인정보 처리방침','본문 249쪽 / 대비표 2쪽','정확한 명칭·강조·실제 안내 페이지 연결 확인'],['로그인 방식 목록','본문 1007쪽 / 대비표 2쪽','복수 방식 도입 시 사용자 관점 분류 및 배치 재평가']],note:'대비표 227/246/998쪽은 섹션 시작입니다. 번호 후보의 원문 등급은 개별 확인 전까지 미확인입니다.'},['references/ 원본 PDF 두 개','UI-017','UI-019']);
add('로그인과 검색 화면','실제 실행 화면과 연결 규칙·시험을 함께 남깁니다.',{images:[shot(/login|로그인/i),shot(/list|search|목록|검색/i)].filter(Boolean),cases:caseFor(['SEC-007','UI-033','UI-034','UI-055'])},['evidence/index.json']);
add('입력 오류와 완료 화면','입력 보존·수정방법·후속 행동을 상태별로 확인합니다.',{images:[shot(/form|error|입력|오류/i),shot(/complete|success|완료|detail/i)].filter(Boolean),cases:caseFor(['UI-056','UI-068','UI-069'])},['evidence/index.json']);
add('키보드·초점·모달 검증','DOM 자동 확인과 실제 키보드 수동 과업을 구분합니다.',{image:shot(/modal|focus|keyboard|모달|초점/i),imageLabel:'실제 모달·초점 상태',lines:taskResults(/키보드|초점|모달|keyboard|focus|modal/i).map(t=>`${t.test_id} ${t.status}: ${short(t.observed||t.expected,105)}`),note:'화면낭독기 음성 출력·실제 사용 맥락은 DOM 또는 aria 검사로 대체하지 않습니다.'},['standards/tests.json','evidence/index.json']);
add('확대·대비·반응형 결과','자동 실측과 수동 확인의 범위를 나눠 기록합니다.',{image:shot(/mobile|reflow|320|responsive|모바일|반응형/i),imageLabel:'실행한 좁은 화면',lines:taskResults(/대비|확대|간격|리플로우|반응형|contrast|reflow|mobile/i).map(t=>`${t.test_id} ${t.status}: ${short(t.observed||t.expected,105)}`),note:'WCAG AA 4.5:1·3:1과 KRDS 선명한 모드 15:1·7:1·4.5:1, 회사 목표 44×44를 구분합니다.'},['standards/tests.json','docs/ACCESSIBILITY_STANDARD.md']);
add('보조기술·장애유형별 수동 평가','환경과 검사자·실제 관찰이 없는 과업은 미실행으로 남깁니다.',{headers:['환경·대상','실제 수행','후속 과업'],rows:[['Windows NVDA + Chromium / Firefox','미실행 / 환경·검사자 미확보','로그인부터 제출·상세·첨부까지 의미·상태 낭독'],['TalkBack + Chrome','미실행 / 실제 모바일 환경 미확보','탐색·입력·오류·완료와 첨부 과업'],['iOS VoiceOver + Safari','미실행 / 실제 모바일 환경 미확보','모바일 초점·레이블·상태·로터 탐색'],['장애 당사자 참여 사용성 평가','미실행 / 참여자·평가계획 미확정','대표 과업의 성공·오류·복구 관찰']],note:`원본 ${scenarios.length}개 대표과업과 기준별 추가 수동 절차를 Excel에 함께 보존합니다.`},['standards/tests.json','reference-package/accessibility_scenarios.json']);
add('자동검사와 수동검사 집계','정의된 검사그룹·수동 절차와 실행한 원시 세부시험을 구분합니다.',{headers:['등록된 시험 정의','정의 수','그룹·절차의 상태 분포'],rows:[['자동 검사그룹',String(autoTests.length),runCounts(autoTests)],['수동 시험 절차',String(manualTests.length),runCounts(manualTests)],['증빙 파일',String(evidence.length),`존재·SHA-256 일치 ${[...evidenceValid.values()].filter(Boolean).length}개`],['원본 대표 과업',String(scenarios.length),'수동 절차에 포함. 실제 실행 건수로 합산하지 않음']],note:'정의 수는 실행한 세부시험 수가 아닙니다. 단위·HTTP·브라우저 검사의 실제 결과는 원시 증빙에 별도 기록합니다. 자동 오류 0건은 전체 접근성 준수나 인증을 뜻하지 않습니다.'},['standards/tests.json','evidence/index.json']);
add('표준별 적용·구현·검증 집계','분모는 각 표준군의 적용 확정 항목입니다.',{headers:['표준군','관리행','적용','조건부','해당없음','확인필요','구현','검증완료'],rows:calculated.map(f=>[f.family,...['total','applicable','conditional','not_applicable','unconfirmed','implemented','verified'].map(k=>String(f[k]))]),dense:true,note:'구현률 = 구현/적용. 검증완료율 = 필요한 자동·수동·증빙을 모두 갖춘 통과/적용. 적용 0건은 산정대상 없음.'},['standards/summary.json','reports/Company_SW_Standards_Register.xlsx']);
add('잔여사항과 운영 전 조치','미확정·조건부·미실행을 공개하고 후속 조건을 남깁니다.',{headers:['잔여사항','현재 판정','다음 조치'],rows:[['MDR 세부 기준 적용','명칭 확인 / 적용 확인필요','원본 코드표·판본·해당 사업 적용범위 확보'],['원문 등급·비번호 규칙','재확인필요','725 후보와 비번호 범위의 조항·조건 개별 검토'],['보조기술·당사자 평가','미실행','장비·검사자·참여자·과업 지정 후 실제 관찰'],['운영 보안·백업·배포','운영 전 검증 필요','악성코드 엔진, HTTPS·비밀·백업 복원과 운영 설정 검토'],['회사 기준·편차 승인','승인 전 초안','담당자·승인자·기한 확정. 승인 편차를 외부 PASS로 환산하지 않음']],note:(summary.limitations||[]).map(x=>short(x,110)).slice(0,2).join('\n')},['standards/deviations.json','docs/RUNBOOK.md','standards/summary.json']);
add('출처와 증빙 찾아보기','도움말에서 규칙을 검색하고 문서 작업용으로 복사·다운로드합니다.',{image:shot(/help|standards|도움말|표준/i),imageLabel:'실행한 도움말 표준 조회',lines:['통합 원장: standards/catalog.json 및 application-records.json','시험·증빙: standards/tests.json 및 evidence/index.json','Excel: 상태 편집과 수식 집계, 원문 전체 색인','HTML: 모든 규칙·시험·증빙의 검색 가능한 텍스트','도움말: 표준별 조회, 각 항목 복사, 파일 다운로드'],note:`원문: 첨부 2025.08 PDF 두 개와 source-register. 생성 기준 commit ${commit.slice(0,12)||'미기록'}`},['standards/source-register.json','evidence/index.json']);

const presentation=Presentation.create({slideSize:{width:1280,height:720}});
const nativeOwners=[];
function text(slide,value,x,y,w,h,size=24,color=navy,bold=false){
  const sh=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  sh.text=asText(value);sh.text.style={fontSize:size,typeface:font,color,bold,wrap:'square',autoFit:'none',verticalAlignment:'top',insets:0};return sh;
}
function table(slide,headers,rows,y=178,height=390,dense=false){
  if(!rows.length){text(slide,'해당 실행결과 없음 / 미실행',72,y,1136,80,27);return;}
  const vals=[headers,...rows];const cols=headers.length;
  const tracks=cols===8?[2.1,...Array(7).fill(1)]:cols===4?(headers[0]==='시험·검사'?[2.1,0.9,3.2,1.8]:[1.5,2.7,1.7,1.7]):cols===3?[1.5,2.15,3.1]:Array(cols).fill(1);
  const t=slide.tables.add({rows:vals.length,columns:cols,left:72,top:y,width:1136,height,columnTracks:tracks.map(value=>({mode:'fr',value})),values:vals});
  t.styleOptions={headerRow:true,bandedRows:false};
  const block=t.cells.block({row:0,column:0,rowCount:vals.length,columnCount:cols});
  block.assign({textStyle:{typeface:font,fontSize:dense?20:22,color:navy,verticalAlignment:'middle',wrap:'square'},margins:{top:dense?4:9,bottom:dense?4:9,left:12,right:12},anchor:'center'});
  t.borders.assign({style:'solid',fill:'#D6DFE9',width:0.8});
  for(let r=0;r<vals.length;r++)for(let c=0;c<cols;c++){
    const cell=t.getCell(r,c);cell.fill=r===0?navy:r%2?'#FFFFFF':'#F2F5F9';
    cell.text.style={typeface:font,fontSize:r===0?(dense?19:22):(dense?20:22),color:r===0?'#FFFFFF':navy,bold:r===0,wrap:'square',verticalAlignment:'middle',insets:{top:dense?4:9,bottom:dense?4:9,left:12,right:12}};
  }
  t.rows[0].height=dense?42:52;
  for(let r=1;r<vals.length;r++)t.rows[r].height=(height-(dense?42:52))/rows.length;
}
async function imageAt(slide,e,x,y,w,h){
  if(!e){text(slide,'해당 상태의 실행 캡처 없음\n미실행·증빙 없음으로 유지',x,y,w,h,26,muted);return;}
  const bytes=await fs.readFile(path.join(root,e.artifact_path));
  slide.images.add({blob:bytes,contentType:/\.png$/i.test(e.artifact_path)?'image/png':'image/jpeg',alt:`${e.observed||e.artifact_path}. ${e.evidence_id}, ${e.result}.`,fit:'contain',position:{left:x,top:y,width:w,height:h}});
}
for(let i=0;i<slideData.length;i++){
  const d=slideData[i],sl=presentation.slides.add();sl.background.fill=d.cover?navy:'#FFFFFF';
  if(d.cover){
    text(sl,d.title,80,150,1100,140,56,'#FFFFFF',true);text(sl,d.subtitle,83,335,1080,70,27,'#CFDCEC');
    text(sl,d.lines.join('\n'),83,447,1100,190,22,'#CFDCEC');
  }else{
    text(sl,d.title,72,49,1136,65,40,navy,true);text(sl,d.subtitle,72,123,1136,42,23,muted);
    if(d.headers){table(sl,d.headers,d.rows,181,d.codeSnippet?270:d.dense?408:392,d.dense);nativeOwners.push(i+1);if(d.codeSnippet){text(sl,d.codePath,72,476,1136,26,18,muted);text(sl,d.codeSnippet,72,508,1136,104,19,navy);}}
    else if(d.images){
      const actual=d.images.length;for(let j=0;j<Math.max(actual,1);j++)await imageAt(sl,d.images[j],72+j*582,180,actual===1?1136:554,312);
      for(let j=0;j<d.images.length;j++){
        const e=d.images[j];
        text(sl,`${e.evidence_id} / ${e.test_id} / ${e.result}\n${short(e.artifact_path,76)}\n환경: ${short(e.environment||e.browser_or_assistive_technology,45)}`,72+j*582,503,actual===1?1136:554,105,17,muted);
      }
      text(sl,(d.cases||[]).slice(0,3).map(r=>`${r.rule_id}: ${short(asText(r.code_refs),60)} / ${short(asText(r.test_refs),36)} / ${r.final_result}`).join('\n'),72,614,1136,57,15,muted);
    }else{
      await imageAt(sl,d.image,72,185,690,365);
      text(sl,(d.lines||[]).join('\n\n'),795,188,413,380,22,navy);
      if(d.image){text(sl,`${d.image.evidence_id} / ${d.image.test_id} / ${d.image.result}\n${short(d.image.artifact_path,105)}\n환경: ${short(d.image.environment||d.image.browser_or_assistive_technology,120)}`,72,566,1136,76,17,muted);}
      if(d.cases?.length)text(sl,d.cases.map(r=>`${r.rule_id} / ${short(asText(r.code_refs),50)} / ${short(asText(r.test_refs),36)} / ${r.final_result}`).join('\n'),72,642,1136,40,15,muted);
    }
    if(d.note)text(sl,d.note,72,d.headers?622:645,1136,d.headers?48:38,18,muted);
    text(sl,`${asOf}  /  실제 결과와 미검증 상태 구분`,72,685,1050,22,15,muted);text(sl,String(i+1).padStart(2,'0'),1140,685,68,22,16,muted);
  }
  const e=(d.image?[d.image]:d.images||[]).filter(Boolean);
  sl.speakerNotes.text=[...d.sources.map(s=>`출처: ${s}`),...e.map(x=>`증빙: ${JSON.stringify(x)}`),...(d.cases||[]).map(r=>`적용 사례: ${JSON.stringify({rule_id:r.rule_id,code_refs:r.code_refs,test_refs:r.test_refs,evidence_ids:r.evidence_ids,auto_result:r.auto_result,manual_result:r.manual_result,final_result:r.final_result})}`)].join('\n');
  const png=await presentation.export({slide:sl,format:'png',scale:1});
  await fs.writeFile(path.join(build,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
const candidate=path.join(build,'candidate.pptx');await (await PresentationFile.exportPptx(presentation)).save(candidate);
const skill=process.env.CODEX_PRESENTATIONS_SKILL||path.join(os.homedir(),'.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.51657/skills/presentations');
const finalPath=path.join(out,'Company_SW_Standards_Application_Report.pptx');
// The finalizer writes a distinct file and will not overwrite an existing output.
const privateFinal=path.join(build,'final-output');await fs.mkdir(privateFinal,{recursive:true});
const revision=path.join(privateFinal,`final-${Date.now()}.pptx`);
const receipt=path.join(build,`${path.basename(revision)}.validation.json`);
let finalization={};
try{
  const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
  finalization=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:revision,pythonExecutable:path.join(runtime,'python/bin/python3.12'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...nativeOwners.flatMap(n=>['--require-native-table-slide',String(n)])],explicitTotalSlideCount:18,requiredNativeTableOwnerSlides:nativeOwners,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:receipt});
  await fs.copyFile(revision,finalPath);
  await fs.copyFile(receipt,path.join(build,'pptx-validation.json'));
}catch(error){await fs.writeFile(path.join(build,'pptx-finalization-error.txt'),String(error.stack||error));throw error;}

let htmlTableCount=0;
const tableHtml=(headers,rows)=>`<div class="table-wrap" role="region" tabindex="0" aria-label="표 ${++htmlTableCount}. ${esc(headers.join(', '))}"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((c,i)=>`<${i?'td':'th scope="row"'}>${esc(c).replace(/\n/g,'<br>')}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const imgHtml=e=>e?`<figure><img src="${imageData.get(e.evidence_id)}" alt="${esc(e.observed||e.artifact_path)}"><figcaption>${esc(e.evidence_id)} / ${esc(e.test_id)} / ${esc(e.result)}<br>${esc(e.artifact_path)}<br>환경: ${esc(asText(e.environment||e.browser_or_assistive_technology))}</figcaption></figure>`:'<p>실행 캡처 없음. 미실행·증빙 없음 상태를 유지합니다.</p>';
const reportSections=slideData.map((s,i)=>`<section id="section-${i+1}"><h2>${i+1}. ${esc(s.title)}</h2><p>${esc(s.subtitle)}</p>${s.headers?tableHtml(s.headers,s.rows):''}${s.codeSnippet?`<p>${esc(s.codePath)}</p><pre><code>${esc(s.codeSnippet)}</code></pre>`:''}${s.image?imgHtml(s.image):''}${s.images?s.images.map(imgHtml).join(''):''}${s.lines?`<ul>${s.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}${s.note?`<p class="note">${esc(s.note)}</p>`:''}<p class="source">출처: ${s.sources.map(esc).join(', ')}</p></section>`).join('');
const ruleDetails=merged.map(r=>`<article class="rule" id="${esc(r.rule_id)}" data-search="${esc(`${r.rule_id} ${r.family} ${r.title} ${r.requirement}`.toLocaleLowerCase())}"><h3>${esc(r.rule_id)} ${esc(r.title)}</h3><p>${esc(r.family)} / ${esc(r.applicability)} / 구현 ${esc(r.implementation_status)} / 자동 ${esc(r.auto_result)} / 수동 ${esc(r.manual_result)} / 최종 ${esc(r.final_result)}</p><p>${esc(r.requirement)}</p><dl><dt>출처·원문</dt><dd>${esc(`${r.source_id} ${r.source_version} ${r.source_clause} ${r.source_page}`)}</dd><dt>원문 요구수준 / 회사 요구수준</dt><dd>${esc(r.source_requirement_level)} / ${esc(r.company_level)}</dd><dt>적용사유·재평가 조건</dt><dd>${esc(r.applicability_reason)} ${esc(r.trigger_condition)}</dd><dt>구현</dt><dd>${esc(r.implementation_summary)}<br>${esc(asText(r.code_refs)).replace(/\n/g,'<br>')}</dd><dt>시험·증빙</dt><dd>${esc(asText(r.test_refs)).replace(/\n/g,'<br>')}<br>${esc(asText(r.evidence_ids)).replace(/\n/g,'<br>')}</dd><dt>검증 방법</dt><dd>${esc(r.verification_method)}</dd></dl><button type="button" data-copy="${esc(r.rule_id)}">${esc(r.rule_id)} 항목 복사</button></article>`).join('');
const exports={generated_at:asOf,commit_sha:commit,rules:merged,tests,evidence,summary};
await fs.writeFile(path.join(out,'standards-result.json'),JSON.stringify(exports,null,2));
const csvCell=v=>'"'+asText(v).replace(/"/g,'""')+'"';
const completionValues=sheets[1].getRange(`AJ7:AJ${end}`).values;
const csvRows=masterRows.slice(1).map((row,i)=>{const cells=[...row];cells[35]=completionValues[i][0];return cells;});
await fs.writeFile(path.join(out,'standards-result.csv'),'\uFEFF'+[headers,...csvRows].map(row=>row.map(v=>csvCell(safe(v))).join(',')).join('\r\n'));
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>회사 SW 표준 적용 결과보고서</title><style>body{font:17px/1.65 Arial,sans-serif;color:#142c48;background:#fff;margin:0}main,header,footer{max-width:1180px;margin:auto;padding:24px}h1{font-size:2.3rem}h2{font-size:1.7rem;margin-top:2rem}h3{font-size:1.25rem}a{color:#064da6}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #9f3b00;outline-offset:4px}section{border-top:1px solid #cbd5e1;padding-top:12px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:16px}th,td{padding:12px;border:1px solid #cbd5e1;text-align:left;vertical-align:top}thead{background:#142c48;color:white}tbody tr:nth-child(even){background:#f3f6f9}.table-wrap{overflow:auto}img{display:block;max-width:100%;max-height:620px;object-fit:contain}figure{margin:24px 0}figcaption,.source{font-size:14px;color:#53667e;overflow-wrap:anywhere}.note{padding-left:16px;border-left:4px solid #bd7900}button,input{font:inherit;padding:12px;min-height:44px}button{background:#fff;border:1px solid #53667e;color:#142c48;cursor:pointer}input{max-width:100%;box-sizing:border-box}.rule{border-top:1px solid #cbd5e1;padding:20px 0;overflow-wrap:anywhere}dt{font-weight:bold;margin-top:10px}dd{margin-left:0}.skip{position:absolute;top:-100px}.skip:focus{top:0;background:white;padding:12px}nav a{display:inline-block;margin:6px 16px 6px 0}#copy-status{position:sticky;bottom:0;background:white}code{overflow-wrap:anywhere}@media(max-width:500px){main,header,footer{padding:16px}h1{font-size:1.8rem}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style><a class="skip" href="#main">본문 바로가기</a><header><h1>회사 SW 표준 적용 결과보고서</h1><p>${esc(asOf)} / commit ${esc(commit)} / 회사 승인 전</p><nav aria-label="다운로드 및 보고서"><a href="Company_SW_Standards_Register.xlsx" download>Excel 적용대장 다운로드</a><a href="Company_SW_Standards_Application_Report.pptx" download>PPTX 결과보고서 다운로드</a><a href="standards-result.json" download>전체 JSON 다운로드</a><a href="standards-result.csv" download>항목 CSV 다운로드</a><a href="#rules">전체 표준 조회</a></nav></header><main id="main">${reportSections}<section id="rules"><h2>전체 표준 조회와 항목 복사</h2><label for="rule-search">규칙 ID·표준군·제목·요구사항 검색</label><br><input id="rule-search" type="search" placeholder="예: UI-019, 개인정보, WCAG"><p id="rule-count" role="status">${rules.length}개 관리행</p>${ruleDetails}</section><section><h2>모든 시험의 절차와 실제 결과</h2>${tableHtml(['시험 ID','유형','규칙','제목','절차·예상','판정·실제 관찰','증빙'],tests.map(t=>[t.test_id,t.type,asText(t.rule_ids),t.title,`${asText(t.steps)}\n예상: ${t.expected}`,`${t.status}\n${t.observed||''}`,asText(t.evidence_ids)]))}</section><section><h2>증빙 찾아보기</h2>${tableHtml(['증빙 ID','시험·실행','결과','파일','환경·도구','제약'],evidence.map(e=>[e.evidence_id,`${e.test_id}\n${e.run_id}`,e.result,e.artifact_path,`${asText(e.environment)}\n${e.tool_name} ${e.tool_version}`,e.limitations]))}</section><p id="copy-status" role="status" aria-live="polite"></p></main><footer><p>자동검사 통과는 외부 인증이나 전체 접근성 준수를 뜻하지 않습니다. 미실행·확인필요·부분확인은 그대로 유지합니다.</p></footer><script>const input=document.querySelector('#rule-search');const articles=[...document.querySelectorAll('.rule')];input.addEventListener('input',()=>{let n=0;for(const a of articles){a.hidden=!a.dataset.search.includes(input.value.toLocaleLowerCase());if(!a.hidden)n++}document.querySelector('#rule-count').textContent=n+'개 관리행'});document.addEventListener('click',async event=>{const b=event.target.closest('[data-copy]');if(!b)return;const a=b.closest('article');const t=a.innerText.replace(/\\n[^\\n]*항목 복사$/,'');try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(t);else{const area=document.createElement('textarea');area.value=t;document.body.append(area);area.select();if(!document.execCommand('copy'))throw Error('copy');area.remove();b.focus()}document.querySelector('#copy-status').textContent=b.dataset.copy+' 항목을 복사했습니다.'}catch{document.querySelector('#copy-status').textContent='복사할 수 없습니다. 항목 내용을 선택하여 복사하거나 JSON 파일을 다운로드하세요.'}});</script></html>`;
// Keep the served report functional under the application's script-src 'self' CSP.
const reportScript=html.match(/<script>([\s\S]*?)<\/script>/);
if(!reportScript)throw new Error('Report client script was not generated');
await fs.writeFile(path.join(out,'report.js'),reportScript[1]);
await fs.writeFile(path.join(out,'index.html'),html.replace(reportScript[0],'<script src="report.js" defer></script>').replace('a:focus-visible,button:focus-visible,input:focus-visible','a:focus-visible,button:focus-visible,input:focus-visible,.table-wrap:focus-visible'));
await fs.writeFile(path.join(build,'report-build-validation.json'),JSON.stringify({as_of:asOf,commit_sha:commit,counts:{rules:rules.length,tests:tests.length,evidence:evidence.length,numbered:numbered.length,sections:sections.length,interactions:interactions.length,slides:slideData.length},families:calculated,formula_fixtures:fixtureResults,rendered_sheets:sheetNames,rendered_slides:18,powerpoint_application_validation:'미실행 / PowerPoint에서 열기·편집 동작은 이 빌더가 수행하지 않음',excel_application_validation:'Artifact Tool 계산·편집 fixture 확인. Microsoft Excel 실제 앱 검사는 별도.',finalization},null,2));
console.log(JSON.stringify({reports:['reports/Company_SW_Standards_Register.xlsx','reports/Company_SW_Standards_Application_Report.pptx','reports/index.html'],rules:rules.length,tests:tests.length,evidence:evidence.length,families:calculated},null,2));
