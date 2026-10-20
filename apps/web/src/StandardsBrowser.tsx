import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Download,
  Copy,
  FileText,
  ArrowUpRight,
  ShieldCheck,
  BookOpen,
  SlidersHorizontal,
  Check,
  RefreshCw,
} from "lucide-react";
import { array, object, errorMessage } from "./api";
import { downloadText, makeCsv } from "./export";
import { ErrorBox, Empty, Loading, Modal } from "./ui";
type Row = Record<string, unknown>;
interface Standard extends Row {
  rule_id: string;
  title: string;
  family: string;
  category: string;
  requirement: string;
  applicability: string;
  implementation_status: string;
  auto_result: string;
  manual_result: string;
  verification: string;
  code_refs: unknown[];
  test_refs: unknown[];
  evidence_ids: unknown[];
}
function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "미기록";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : value ? [value] : [];
}
function join(value: unknown): string {
  return (
    list(value)
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("\n") || "연결 없음"
  );
}
function verification(row: Row): string {
  if (row.applicability === "해당없음") return "해당없음";
  if (row.auto_result === "실패" || row.manual_result === "실패") return "실패";
  const required = text(row.required_verification);
  const auto = !required.includes("자동") || row.auto_result === "통과";
  const manual = !required.includes("수동") || row.manual_result === "통과";
  if (
    auto &&
    manual &&
    row.final_result === "통과" &&
    row.implementation_status === "구현" &&
    list(row.code_refs).length > 0 &&
    list(row.test_refs).length > 0 &&
    list(row.evidence_ids).length > 0 &&
    !!row.reviewer &&
    !!row.reviewed_at &&
    !row.deviation_id &&
    row.applicability === "적용"
  )
    return "통과";
  if (
    row.auto_result === "통과" ||
    row.manual_result === "통과" ||
    row.auto_result === "부분확인" ||
    row.manual_result === "부분확인"
  )
    return "부분확인";
  return "미실행";
}
function normalize(raw: unknown, records: Row[]): Standard {
  const row = object(raw),
    record = records.find((r) => r.rule_id === row.rule_id) ?? {},
    merged = { ...row, ...record };
  return {
    ...merged,
    rule_id: text(merged.rule_id),
    title: text(merged.title),
    family: text(merged.family ?? merged.category),
    category: text(merged.category),
    requirement: text(merged.requirement),
    applicability: text(merged.applicability),
    implementation_status: text(merged.implementation_status),
    auto_result: text(merged.auto_result),
    manual_result: text(merged.manual_result),
    verification: verification(merged),
    code_refs: list(merged.code_refs),
    test_refs: list(merged.test_refs),
    evidence_ids: list(merged.evidence_ids),
  };
}
function documentText(
  row: Standard,
  sources: Row[] = [],
  evidence: Row[] = [],
  tests: Row[] = [],
): string {
  const summary = `## ${row.rule_id} · ${row.title}\n\n표준 분류: ${row.family}\n기준 성격: ${text(row.reference_kind)}\n원문 요구수준: ${text(row.source_requirement_level)}\n회사 기준: ${text(row.company_level)}\n\n요구사항: ${row.requirement}\n적용성: ${row.applicability}\n적용 사유: ${text(row.applicability_reason)}\n재평가 조건: ${text(row.trigger_condition)}\n대상 화면: ${text(row.target_screens)}\n\n출처: ${text(row.source_id)} / ${text(row.source_version)}\n원문 절: ${text(row.source_clause)}\n원문 페이지: ${text(row.source_page)}\n원문 검토: ${text(row.source_review_status)}\n\n구현 상태: ${row.implementation_status}\n구현 내용: ${text(row.implementation_summary ?? row.planned_implementation)}\n코드: ${join(row.code_refs)}\n\n검증 방법: ${text(row.verification_method)}\n필수 확인: ${text(row.required_verification)}\n시험: ${join(row.test_refs)}\n자동 결과: ${row.auto_result}\n수동 결과: ${row.manual_result}\n검증 판정: ${row.verification}\n증빙: ${join(row.evidence_ids)}\n검토자: ${text(row.reviewer)}\n검토일: ${text(row.reviewed_at)}\n편차: ${text(row.deviation_id)}\n\n주의: 자동검사 결과는 웹접근성 인증이나 전체 표준 준수를 의미하지 않습니다.\n`;
  const linkedSources = sources.filter(
    (item) => item.source_id === row.source_id,
  );
  const linkedTests = tests.filter((item) =>
    row.test_refs.some((id) => id === item.test_id),
  );
  const linkedEvidence = evidence.filter((item) =>
    row.evidence_ids.some((id) => id === item.evidence_id),
  );
  return (
    summary +
    `\n### 출처 상세\n${JSON.stringify(linkedSources, null, 2)}\n\n### 시험 상세\n${JSON.stringify(linkedTests, null, 2)}\n\n### 증빙 상세\n${JSON.stringify(linkedEvidence, null, 2)}\n`
  );
}
function ReferenceList({
  items,
  records,
  label,
}: {
  items: unknown[];
  records: Row[];
  label: string;
}) {
  if (items.length === 0)
    return <p className="muted">연결 없음 · 검증 근거를 확인해야 합니다.</p>;
  return (
    <ul className="reference-list">
      {items.map((item, index) => {
        const id = typeof item === "string" ? item : text(item);
        const record = records.find(
          (r) => r.evidence_id === id || r.source_id === id || r.test_id === id,
        );
        return (
          <li key={`${label}-${index}`}>
            <code>{id}</code>
            {record && <pre>{JSON.stringify(record, null, 2)}</pre>}
          </li>
        );
      })}
    </ul>
  );
}
export function StandardsBrowser() {
  const [rows, setRows] = useState<Standard[]>([]),
    [sources, setSources] = useState<Row[]>([]),
    [evidence, setEvidence] = useState<Row[]>([]),
    [tests, setTests] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [family, setFamily] = useState(""),
    [applicability, setApplicability] = useState(""),
    [result, setResult] = useState(""),
    [page, setPage] = useState(1),
    [notice, setNotice] = useState(""),
    [copyFallback, setCopyFallback] = useState("");
  const copyArea = useRef<HTMLTextAreaElement>(null);
  const load = () => {
    setLoading(true);
    setError("");
    void fetch("/standards-data.json")
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "표준 데이터 파일을 불러오지 못했습니다. 보고서 생성 명령을 실행한 뒤 다시 시도하세요.",
          );
        const raw: unknown = await response.json();
        const data = Array.isArray(raw) ? { catalog: raw } : object(raw);
        const catalogRaw = data.catalog ?? data.rules;
        const catalog = Array.isArray(catalogRaw)
          ? catalogRaw
          : array(object(catalogRaw).rules);
        const records = list(
          data.applicationRecords ?? data.application_records,
        ).map(object);
        setRows(catalog.map((row) => normalize(row, records)));
        setSources(list(data.sources).map(object));
        setEvidence(list(data.evidence).map(object));
        setTests(list(data.tests).map(object));
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    if (copyFallback) {
      copyArea.current?.focus();
      copyArea.current?.select();
    }
  }, [copyFallback]);
  const families = useMemo(
    () => [...new Set(rows.map((row) => row.family))],
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!query ||
            `${row.rule_id} ${row.title} ${row.requirement} ${text(row.source_clause)} ${join(row.code_refs)} ${join(row.test_refs)}`
              .toLocaleLowerCase("ko")
              .includes(query.toLocaleLowerCase("ko"))) &&
          (!family || row.family === family) &&
          (!applicability || row.applicability === applicability) &&
          (!result || row.verification === result),
      ),
    [rows, query, family, applicability, result],
  );
  const current = filtered.slice((page - 1) * 20, page * 20);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const changeFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  async function copy(row: Standard) {
    const value = documentText(row, sources, evidence, tests);
    try {
      if (!navigator.clipboard) throw new Error("클립보드 접근 불가");
      await navigator.clipboard.writeText(value);
      setNotice(
        `${row.rule_id}의 요구사항·출처·구현·시험·증빙을 복사했습니다.`,
      );
    } catch {
      setCopyFallback(value);
      setNotice("자동 복사가 허용되지 않아 수동 복사 창을 열었습니다.");
    }
  }
  function download(format: "json" | "csv" | "md") {
    const stamp = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    if (format === "json")
      downloadText(
        `FlowCore_표준_${stamp}.json`,
        "application/json;charset=utf-8",
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            scope: "현재 필터 결과",
            filters: { query, family, applicability, result },
            rules: filtered,
            sources,
            evidence,
            tests,
          },
          null,
          2,
        ),
      );
    if (format === "csv") {
      const exportRows = filtered.map((row) => ({
        표준_ID: row.rule_id,
        분류: row.family,
        제목: row.title,
        요구사항: row.requirement,
        적용성: row.applicability,
        적용사유: text(row.applicability_reason),
        원문수준: text(row.source_requirement_level),
        회사수준: text(row.company_level),
        출처_ID: text(row.source_id),
        출처상세: JSON.stringify(
          sources.filter((item) => item.source_id === row.source_id),
        ),
        판본: text(row.source_version),
        절: text(row.source_clause),
        페이지: text(row.source_page),
        구현상태: row.implementation_status,
        구현내용: text(row.implementation_summary),
        코드: join(row.code_refs),
        시험: join(row.test_refs),
        자동결과: row.auto_result,
        수동결과: row.manual_result,
        검증판정: row.verification,
        증빙: join(row.evidence_ids),
        증빙상세: JSON.stringify(
          evidence.filter((item) =>
            row.evidence_ids.some((id) => id === item.evidence_id),
          ),
        ),
      }));
      downloadText(
        `FlowCore_표준_${stamp}.csv`,
        "text/csv;charset=utf-8",
        makeCsv(exportRows),
      );
    }
    if (format === "md")
      downloadText(
        `FlowCore_표준_${stamp}.md`,
        "text/markdown;charset=utf-8",
        `# FlowCore 표준 적용 자료\n\n내보낸 시각: ${new Date().toISOString()}\n필터 결과: ${filtered.length}개 관리 항목. 서로 다른 표준을 합산한 인증 준수율이 아닙니다.\n\n${filtered.map((row) => documentText(row, sources, evidence, tests)).join("\n---\n\n")}`,
      );
    setNotice(
      `${filtered.length}개 필터 결과의 ${format.toUpperCase()} 파일 다운로드를 시작했습니다.`,
    );
  }
  return (
    <>
      <div className="standards-intro">
        <div className="eyebrow" lang="en">
          <BookOpen size={16} /> STANDARD LIBRARY
        </div>
        <h2>기준에서 근거까지, 한곳에서.</h2>
        <p>
          적용 표준을 찾아보고 출처와 실제 구현·검증 기록을 문서에 바로
          활용하세요.
        </p>
        <div className="library-metrics">
          <div>
            <strong>{rows.length || "—"}</strong>
            <span>통합 관리 항목</span>
          </div>
          <div>
            <strong>{families.length || "—"}</strong>
            <span>표준 분류</span>
          </div>
          <div>
            <strong>
              {rows.filter((r) => r.applicability === "확인필요").length}
            </strong>
            <span>확인이 필요한 기준</span>
          </div>
          <ShieldCheck size={65} strokeWidth={1} aria-hidden="true" />
        </div>
      </div>
      <div className="notice-banner">
        <ShieldCheck size={21} />
        <p>
          <strong>검증 범위를 함께 확인하세요.</strong> 자동 결과와 수동 결과는
          별도 기록입니다. 미실행·증빙 누락은 통과로 표시하지 않습니다. MDR은{" "}
          <b>국방 메타데이터 관리시스템(Meta Data Registry)</b>으로 명칭을
          확인했으며, 원본 코드표와 사업 적용 범위는 확인이 필요합니다.
        </p>
      </div>
      <section
        className="download-section"
        aria-labelledby="report-download-title"
      >
        <div>
          <h3 id="report-download-title">문서 작업을 위한 결과 자료</h3>
          <p>동일 원장을 바탕으로 생성한 적용대장과 결과보고서입니다.</p>
        </div>
        <div className="download-actions">
          <a
            className="button secondary"
            href="/reports/Company_SW_Standards_Register.xlsx"
            download
          >
            <Download size={17} /> Excel 적용대장
          </a>
          <a
            className="button secondary"
            href="/reports/Company_SW_Standards_Application_Report.pptx"
            download
          >
            <Download size={17} /> PPTX 보고서
          </a>
          <a className="button text-button" href="/reports/index.html">
            <FileText size={17} /> HTML 보고서
            <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
      <section
        className="panel standards-panel"
        aria-labelledby="standards-title"
      >
        <div className="section-heading">
          <div>
            <h3 id="standards-title">표준 적용 찾아보기</h3>
            <p>ID·제목·요구사항·구현 경로·시험 ID로 검색할 수 있습니다.</p>
          </div>
          <SlidersHorizontal size={21} aria-hidden="true" />
        </div>
        <div className="standards-filters">
          <div className="search-field">
            <label className="sr-only" htmlFor="standard-search">
              표준 검색
            </label>
            <Search size={20} />
            <input
              id="standard-search"
              type="search"
              placeholder="예: 키보드, KWCAG, CODE-001"
              value={query}
              onChange={(e) => changeFilter(setQuery, e.target.value)}
            />
          </div>
          <label>
            표준 분류
            <select
              value={family}
              onChange={(e) => changeFilter(setFamily, e.target.value)}
            >
              <option value="">모든 분류</option>
              {families.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            적용성
            <select
              value={applicability}
              onChange={(e) => changeFilter(setApplicability, e.target.value)}
            >
              <option value="">모든 적용성</option>
              {["적용", "조건부", "해당없음", "확인필요"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            검증 상태
            <select
              value={result}
              onChange={(e) => changeFilter(setResult, e.target.value)}
            >
              <option value="">모든 상태</option>
              {["미실행", "부분확인", "통과", "실패", "해당없음"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="result-toolbar">
          <p role="status">
            검색 결과 <strong>{filtered.length}</strong>개{" "}
            <span className="muted">/ 전체 {rows.length}개</span>
          </p>
          <div className="export-actions">
            <button
              className="button text-button"
              onClick={() => {
                setQuery("");
                setFamily("");
                setApplicability("");
                setResult("");
                setPage(1);
              }}
            >
              <RefreshCw size={15} /> 초기화
            </button>
            {(["json", "csv", "md"] as const).map((format) => (
              <button
                className="button small secondary"
                key={format}
                onClick={() => download(format)}
                disabled={loading || !!error}
              >
                <Download size={15} />
                {format === "md" ? "Markdown" : format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Loading label="표준 원장과 증빙을 불러오는 중입니다." />
        ) : error ? (
          <ErrorBox message={error}>
            <button className="button secondary" onClick={load}>
              다시 불러오기
            </button>
          </ErrorBox>
        ) : filtered.length === 0 ? (
          <Empty
            title="검색 조건에 맞는 표준이 없습니다."
            description="다른 검색어를 입력하거나 필터를 초기화하세요."
          />
        ) : (
          <div className="standards-list">
            {current.map((row) => (
              <article className="standard-card" key={row.rule_id}>
                <div className="standard-top">
                  <div>
                    <span className="rule-id">{row.rule_id}</span>
                    <span className="family-name">{row.family}</span>
                  </div>
                  <button
                    className="button copy-button"
                    onClick={() => {
                      void copy(row);
                    }}
                    aria-label={`${row.rule_id} 항목 복사 · 문서용 내용`}
                  >
                    <Copy size={16} /> 항목 복사
                  </button>
                </div>
                <h4>{row.title}</h4>
                <p className="requirement">{row.requirement}</p>
                <div className="standard-badges">
                  <span
                    className={`badge ${row.applicability === "확인필요" ? "warning" : ""}`}
                  >
                    {row.applicability}
                  </span>
                  <span className="badge neutral">
                    구현 · {row.implementation_status}
                  </span>
                  <span
                    className={`badge ${row.verification === "통과" ? "status-completed" : row.verification === "실패" ? "danger" : "neutral"}`}
                  >
                    {row.verification === "통과" && <Check size={13} />}검증 ·{" "}
                    {row.verification}
                  </span>
                  <span className="level-text">
                    원문: {text(row.source_requirement_level)} / 회사:{" "}
                    {text(row.company_level)}
                  </span>
                </div>
                <details>
                  <summary>출처 · 구현 · 시험 · 증빙 상세</summary>
                  <div className="standard-details">
                    <dl>
                      <div>
                        <dt>기준 성격</dt>
                        <dd>{text(row.reference_kind)}</dd>
                      </div>
                      <div>
                        <dt>원문 출처</dt>
                        <dd>
                          {text(row.source_id)} · {text(row.source_version)}
                          <br />
                          {text(row.source_clause)} / 페이지:{" "}
                          {text(row.source_page)}
                          <br />
                          원문검토: {text(row.source_review_status)}
                        </dd>
                      </div>
                      <div>
                        <dt>적용 사유</dt>
                        <dd>{text(row.applicability_reason)}</dd>
                      </div>
                      <div>
                        <dt>재평가 조건</dt>
                        <dd>{text(row.trigger_condition)}</dd>
                      </div>
                      <div>
                        <dt>대상 화면</dt>
                        <dd>{text(row.target_screens)}</dd>
                      </div>
                      <div>
                        <dt>구현 내용</dt>
                        <dd>
                          {text(
                            row.implementation_summary ??
                              row.planned_implementation,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>검증 방법</dt>
                        <dd>
                          {text(row.verification_method)}
                          <br />
                          필요한 확인: {text(row.required_verification)}
                        </dd>
                      </div>
                      <div>
                        <dt>실제 판정</dt>
                        <dd>
                          자동: {row.auto_result} / 수동: {row.manual_result}
                          <br />
                          검토자: {text(row.reviewer)} / 검토일:{" "}
                          {text(row.reviewed_at)}
                        </dd>
                      </div>
                    </dl>
                    <h5>공식 출처 기록</h5>
                    <ReferenceList
                      items={[row.source_id]}
                      records={sources}
                      label="source"
                    />
                    <h5>실제 코드 연결</h5>
                    <ReferenceList
                      items={row.code_refs}
                      records={[]}
                      label="code"
                    />
                    <h5>시험 연결</h5>
                    <ReferenceList
                      items={row.test_refs}
                      records={tests}
                      label="test"
                    />
                    <h5>실행 증빙</h5>
                    <ReferenceList
                      items={row.evidence_ids}
                      records={evidence}
                      label="evidence"
                    />
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
        {!loading && pages > 1 && (
          <nav className="pagination" aria-label="표준 결과 페이지">
            <button
              className="button secondary"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              이전
            </button>
            <span aria-live="polite">
              {page} / {pages} 페이지
            </span>
            <button
              className="button secondary"
              disabled={page >= pages}
              onClick={() => setPage((v) => v + 1)}
            >
              다음
            </button>
          </nav>
        )}
      </section>
      <p role="status" aria-live="polite" className="copy-notice">
        {notice}
      </p>
      {copyFallback && (
        <Modal
          title="문서용 내용 수동 복사"
          onClose={() => setCopyFallback("")}
        >
          <p>
            클립보드 접근이 허용되지 않았습니다. 아래 내용을 선택한 뒤{" "}
            <kbd>⌘ / Ctrl</kbd> + <kbd>C</kbd>로 복사하세요.
          </p>
          <textarea
            ref={copyArea}
            className="copy-area"
            aria-label="복사할 표준 상세 내용"
            readOnly
            value={copyFallback}
          />
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => setCopyFallback("")}
            >
              확인
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
