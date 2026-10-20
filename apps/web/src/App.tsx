import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  FileText,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  House,
  Layers3,
  LogOut,
  Menu,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  errorMessage,
  parsePage,
  parseRequest,
  parseSession,
  parseSummary,
  refreshCsrf,
  uploadFiles,
} from "./api";
import type { Session, WorkRequest } from "./api";
import {
  Badge,
  CheckboxGroupExample,
  SwitchExample,
  TabsExample,
  categoryNames,
  Empty,
  ErrorBox,
  formatDate,
  Loading,
  Modal,
  statusNames,
  Success,
} from "./ui";
import { StandardsBrowser } from "./StandardsBrowser";
import { safeRequestReturnPath } from "./navigation";
interface Route {
  path: string;
  search: string;
}
function getRoute(): Route {
  return { path: window.location.pathname, search: window.location.search };
}
export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function AppLink({
  to,
  children,
  className = "",
  ...props
}: {
  to: string;
  children: ReactNode;
  className?: string;
  "aria-current"?: "page";
  lang?: string;
  "aria-label"?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      {...props}
      onClick={(event) => {
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
function useRemote<T>(
  path: string,
  parse: (value: unknown) => T,
  revision = 0,
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api(path, { signal: controller.signal })
      .then((raw) => {
        if (!controller.signal.aborted) setData(parse(raw));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, parse, revision]);
  return { data, error, loading };
}
interface Draft {
  title: string;
  category: string;
  description: string;
  files: File[];
  editingId: string;
}
const initialDraft: Draft = {
  title: "",
  category: "general",
  description: "",
  files: [],
  editingId: "",
};
const routeInfo = (path: string) =>
  path === "/help"
    ? ["도움말 & 표준", "서비스 이용과 표준 적용 기록을 확인하세요."]
    : path === "/gallery"
      ? ["컴포넌트 갤러리", "일관된 경험을 만드는 공통 구성요소입니다."]
      : path === "/privacy"
        ? ["개인정보 처리방침", "샘플 서비스의 데이터 처리 안내입니다."]
        : path === "/requests/new"
          ? ["새 업무요청", "필요한 도움을 요청하고 진행 상황을 확인하세요."]
          : path.includes("/edit")
            ? ["요청 수정", "접수 상태의 요청 내용을 수정할 수 있습니다."]
            : path.startsWith("/requests/")
              ? ["요청 상세", "요청 내용과 처리 과정을 확인하세요."]
              : path === "/requests"
                ? ["업무요청", "팀의 요청과 진행 상황을 한눈에 확인하세요."]
                : ["업무 공간", "좋은 업무의 흐름을 함께 만듭니다."];
export function App() {
  const [route, setRoute] = useState(getRoute),
    [session, setSession] = useState<Session | null>(null),
    [initializing, setInitializing] = useState(true),
    [authMessage, setAuthMessage] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [draft, setDraft] = useState<Draft>(initialDraft),
    [remaining, setRemaining] = useState(0),
    [sessionError, setSessionError] = useState(""),
    [warningDismissed, setWarningDismissed] = useState(false);
  const [fontSize, setFontSize] = useState(() =>
      localStorage.getItem("flowcore-font") === "large" ? "large" : "default",
    ),
    [motion, setMotion] = useState(() =>
      localStorage.getItem("flowcore-motion") === "reduce"
        ? "reduce"
        : "system",
    );
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const onRoute = () => {
      setRoute(getRoute());
      setMobileNav(false);
    };
    window.addEventListener("popstate", onRoute);
    return () => window.removeEventListener("popstate", onRoute);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.font = fontSize;
    document.documentElement.dataset.motion = motion;
    localStorage.setItem("flowcore-font", fontSize);
    localStorage.setItem("flowcore-motion", motion);
  }, [fontSize, motion]);
  useEffect(() => {
    void api("/auth/me")
      .then((raw) => setSession(parseSession(raw)))
      .catch((cause: unknown) => {
        if (!(cause instanceof ApiError && cause.status === 401))
          setAuthMessage(errorMessage(cause));
      })
      .finally(() => setInitializing(false));
  }, []);
  useEffect(() => {
    const [title] = routeInfo(route.path);
    document.title = `${title ?? "업무 공간"} · FlowCore`;
    window.requestAnimationFrame(() =>
      main.current?.querySelector("h1")?.focus(),
    );
  }, [route.path, route.search]);
  useEffect(() => {
    if (!session) return;
    setWarningDismissed(false);
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) {
        setSession(null);
        setAuthMessage(
          "로그인 시간이 만료되었습니다. 다시 로그인하세요. 작성 중인 내용은 현재 열린 화면의 메모리에 유지됩니다.",
        );
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setSession(null);
      setAuthMessage("안전하게 로그아웃했습니다.");
      setDraft(initialDraft);
      navigate("/");
    } catch (cause) {
      setAuthMessage(errorMessage(cause));
    }
  }
  async function extend() {
    try {
      setSession(parseSession(await api("/auth/extend", { method: "POST" })));
      setSessionError("");
      setWarningDismissed(false);
    } catch (cause) {
      setSessionError(errorMessage(cause));
    }
  }
  const [title, subtitle] = routeInfo(route.path),
    isPublic = ["/help", "/gallery", "/privacy"].includes(route.path);
  const nav = [
    { to: "/", label: "업무 공간", icon: House },
    {
      to: "/requests",
      label:
        session?.user.role.toLowerCase() === "admin"
          ? "전체 업무요청"
          : "내 업무요청",
      icon: ClipboardList,
    },
    { to: "/requests/new", label: "새 업무요청", icon: FilePlus2 },
  ];
  const helpTab = new URLSearchParams(route.search).get("tab") ?? "standards";
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
          main.current?.scrollIntoView({ block: "start" });
        }}
      >
        본문 바로가기
      </a>
      <aside
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="서비스 탐색"
      >
        <AppLink
          to="/"
          className="brand"
          lang="en"
          aria-label="FlowCore 업무 공간"
        >
          <span className="brand-icon">
            <Layers3 size={25} />
          </span>
          <span>
            flowcore<span className="brand-dot">.</span>
          </span>
        </AppLink>
        <div className="workspace-label" lang="en">
          TEAM WORKSPACE
        </div>
        <nav aria-label="주요 메뉴">
          {nav.map((item) => (
            <AppLink
              key={item.to}
              to={item.to}
              className={`nav-link ${route.path === item.to || (item.to === "/requests" && route.path.startsWith("/requests/") && route.path !== "/requests/new") ? "active" : ""}`}
              aria-current={route.path === item.to ? "page" : undefined}
            >
              <item.icon size={21} />
              {item.label}
              {route.path === item.to && <span className="active-dot" />}
            </AppLink>
          ))}
        </nav>
        <div className="nav-separator" />
        <div className="workspace-label" lang="en">
          RESOURCES
        </div>
        <nav aria-label="자료 메뉴">
          <AppLink
            to="/help"
            className={`nav-link ${route.path === "/help" ? "active" : ""}`}
            aria-current={route.path === "/help" ? "page" : undefined}
          >
            <BookOpen size={21} />
            도움말 & 표준
          </AppLink>
          <AppLink
            to="/gallery"
            className={`nav-link ${route.path === "/gallery" ? "active" : ""}`}
            aria-current={route.path === "/gallery" ? "page" : undefined}
          >
            <Grid2X2 size={21} />
            컴포넌트 갤러리
          </AppLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sample-card">
            <span lang="en">
              <Sparkles size={18} /> BUILD WITH CONFIDENCE
            </span>
            <strong>더 나은 경험의 기준</strong>
            <p>
              표준을 적용하고,
              <br />
              근거를 투명하게 공유합니다.
            </p>
            <AppLink to="/help">
              적용 표준 알아보기 <ArrowRight size={16} />
            </AppLink>
          </div>
          <div className="sample-mark">
            <span className="online-dot" /> 가상 데이터로 운영되는 샘플
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav((v) => !v)}
              aria-expanded={mobileNav}
              aria-label={mobileNav ? "메뉴 닫기" : "메뉴 열기"}
            >
              {mobileNav ? <X size={22} /> : <Menu size={22} />}
            </button>
            <nav className="breadcrumb" aria-label="현재 위치">
              <ol>
                <li>
                  <AppLink to="/">
                    <span className="crumb-symbol" aria-hidden="true">
                      F
                    </span>
                    <span lang="en">FlowCore Workspace</span>
                  </AppLink>
                </li>
                {route.path.startsWith("/requests/") && (
                  <li>
                    <ChevronRight size={15} aria-hidden="true" />
                    <AppLink to="/requests">업무요청</AppLink>
                  </li>
                )}
                <li>
                  <ChevronRight size={15} aria-hidden="true" />
                  <span aria-current="page">{title}</span>
                </li>
              </ol>
            </nav>
          </div>
          <div className="topbar-end">
            <span className="environment-tag" lang="en">
              LOCAL SAMPLE
            </span>
            {session ? (
              <>
                <span className="profile-avatar" aria-hidden="true">
                  {session.user.displayName.slice(0, 1)}
                </span>
                <span className="profile-name">
                  {session.user.displayName}
                  <small>
                    {session.user.role.toLowerCase() === "admin"
                      ? "관리자"
                      : "일반 사용자"}
                  </small>
                </span>
                <button
                  className="icon-button"
                  onClick={() => {
                    void logout();
                  }}
                  aria-label="로그아웃"
                >
                  <LogOut size={19} />
                </button>
              </>
            ) : (
              <span className="muted topbar-login">안전한 업무의 시작</span>
            )}
          </div>
        </header>
        <main
          id="main-content"
          ref={main}
          className="main-content"
          tabIndex={-1}
        >
          <div className="page-heading">
            <div>
              <div className="page-overline" lang="en">
                FLOWCORE / {route.path === "/help" ? "RESOURCES" : "WORKSPACE"}
              </div>
              <h1 tabIndex={-1}>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {session && route.path === "/" && (
              <AppLink to="/requests/new" className="button primary">
                <Plus size={19} /> 새 요청 등록
              </AppLink>
            )}
            {route.path === "/help" && (
              <span className="outline-label">
                <span className="online-dot" /> 기준안 v0.1 · 승인 전
              </span>
            )}
          </div>
          {authMessage && (
            <div className="session-message" role="status">
              {authMessage}
              <button
                className="icon-button"
                aria-label="안내 닫기"
                onClick={() => setAuthMessage("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {isPublic ? (
            route.path === "/help" ? (
              <Help
                tab={helpTab}
                preferences={
                  <Preferences
                    fontSize={fontSize}
                    motion={motion}
                    setFontSize={setFontSize}
                    setMotion={setMotion}
                  />
                }
              />
            ) : route.path === "/gallery" ? (
              <Gallery />
            ) : (
              <Privacy />
            )
          ) : initializing ? (
            <Loading label="로그인 상태를 확인하고 있습니다." />
          ) : !session ? (
            <Login
              onLogin={(value) => {
                setSession(value);
                setAuthMessage("");
                void refreshCsrf().catch((cause: unknown) =>
                  setAuthMessage(errorMessage(cause)),
                );
              }}
            />
          ) : route.path === "/requests/new" ? (
            <RequestWizard
              key="new-request"
              draft={draft}
              setDraft={setDraft}
            />
          ) : route.path.match(/^\/requests\/[^/]+\/edit$/u) ? (
            <RequestWizard
              key={route.path}
              draft={draft}
              setDraft={setDraft}
              editingId={route.path.split("/")[2]}
            />
          ) : route.path.match(/^\/requests\/[^/]+$/u) ? (
            <RequestDetail
              id={route.path.split("/")[2] ?? ""}
              session={session}
            />
          ) : route.path === "/requests" ? (
            <RequestList search={route.search} />
          ) : route.path === "/" ? (
            <Dashboard session={session} />
          ) : (
            <Empty
              title="페이지를 찾을 수 없습니다."
              description="주소를 확인하거나 업무 공간으로 이동하세요."
            >
              <AppLink to="/" className="button primary">
                업무 공간으로
              </AppLink>
            </Empty>
          )}
        </main>
        <footer className="footer">
          <span>
            <strong>flowcore.</strong> &nbsp;팀의 일에 자연스러운 흐름을.
          </span>
          <div>
            <AppLink to="/privacy" className="privacy-link">
              개인정보 처리방침
            </AppLink>
            <AppLink to="/help?tab=guide">접근성 안내</AppLink>
            <span>© 2026 FlowCore Sample</span>
          </div>
        </footer>
      </div>
      {session &&
        remaining > 0 &&
        remaining <= (session.warningSeconds || 60) &&
        !warningDismissed && (
          <Modal
            title="로그인 시간이 곧 만료됩니다"
            onClose={() => setWarningDismissed(true)}
            closeLabel="안내 닫기"
          >
            <p>
              남은 시간 <strong>{remaining}초</strong>. 계속 이용하려면 로그인
              시간을 연장하세요. 만료 전 연장은 10회 이상 가능합니다.
            </p>
            {sessionError && <ErrorBox message={sessionError} />}
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => {
                  void logout();
                }}
              >
                로그아웃
              </button>
              <button
                className="button primary"
                onClick={() => {
                  void extend();
                }}
              >
                로그인 시간 연장
              </button>
            </div>
          </Modal>
        )}
    </div>
  );
}
export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await refreshCsrf();
      onLogin(
        parseSession(
          await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          }),
        ),
      );
      setPassword("");
    } catch (cause) {
      setError(errorMessage(cause));
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-layout">
      <div className="login-story">
        <span className="eyebrow" lang="en">
          <Activity size={17} /> CLEAR REQUESTS. BETTER FLOW.
        </span>
        <h2>
          요청은 간단하게.
          <br />
          진행은 투명하게.
        </h2>
        <p>
          팀에 필요한 도움을 한곳에 모으고,
          <br />
          접수부터 완료까지 흐름을 이어갑니다.
        </p>
        <div className="flow-illustration" aria-hidden="true">
          <div>
            <ClipboardList size={25} />
            <span>요청 등록</span>
            <Check size={16} />
          </div>
          <span className="flow-line" />
          <div className="flow-highlight">
            <Activity size={25} />
            <span>함께 처리</span>
            <span className="pulse-dot" />
          </div>
          <span className="flow-line" />
          <div>
            <CheckCircle2 size={25} />
            <span>업무 완료</span>
            <Check size={16} />
          </div>
        </div>
        <div className="login-principle">
          <ShieldCheck size={21} />
          <span>가상 계정 · 실제 서버 인증 · 역할별 접근 제어</span>
        </div>
      </div>
      <div className="login-panel panel">
        <span className="eyebrow" lang="en">
          WELCOME BACK
        </span>
        <h2>업무 공간 로그인</h2>
        <p className="muted">발급받은 샘플 계정으로 시작하세요.</p>
        {error && (
          <div ref={errorRef} tabIndex={-1}>
            <ErrorBox message={error} />
          </div>
        )}
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label htmlFor="email">
            이메일 <span className="required">필수</span>
          </label>
          <input
            id="email"
            type="email"
            name="username"
            autoComplete="username"
            placeholder="user@sample.test"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
          <label htmlFor="password">
            비밀번호 <span className="required">필수</span>
          </label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-describedby="password-help"
          />
          <p id="password-help" className="field-help">
            비밀번호 관리자와 붙여넣기를 사용할 수 있습니다.
          </p>
          <button
            className="button primary full-width"
            disabled={busy}
            type="submit"
          >
            {busy ? "로그인 중…" : "로그인"}
            <ArrowRight size={19} />
          </button>
        </form>
        <div className="account-help">
          <strong>로컬 샘플 이용 안내</strong>
          <p>
            일반 사용자: <code>user@sample.test</code>
            <br />
            관리자: <code>admin@sample.test</code>
          </p>
          <p>
            비밀번호는 실행 환경의 초기화 설정에서 확인하세요. 실제 개인정보는
            입력하지 마세요.
          </p>
        </div>
      </div>
    </section>
  );
}
export function Dashboard({ session }: { session: Session }) {
  const summary = useRemote("/summary", parseSummary),
    recent = useRemote("/requests?pageSize=5&sort=created_desc", parsePage);
  const getCount = (s: string) =>
    summary.data?.byStatus.find((v) => v.status === s)?.count ?? 0;
  return (
    <>
      <section className="welcome-banner">
        <div>
          <span className="eyebrow" lang="en">
            YOUR WORK, IN FLOW
          </span>
          <h2>
            {session.user.displayName}님,
            <br className="mobile-only" /> 오늘도 좋은 흐름으로.
          </h2>
          <p>
            작은 요청 하나도 놓치지 않도록,
            <br className="mobile-only" /> 모든 업무의 다음 단계를 함께
            확인하세요.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-square">
            <Layers3 size={49} strokeWidth={1.3} />
          </div>
          <span className="art-dot one" />
          <span className="art-dot two" />
          <span className="art-line" />
        </div>
      </section>
      {summary.error && <ErrorBox message={summary.error} />}
      <section aria-labelledby="summary-title">
        <div className="section-heading compact">
          <h2 id="summary-title">업무 현황</h2>
          <span className="muted">
            {session.user.role.toLowerCase() === "admin"
              ? "전체 요청 기준"
              : "내 요청 기준"}{" "}
            · 실시간 조회
          </span>
        </div>
        {summary.loading ? (
          <Loading />
        ) : (
          <div className="stat-grid">
            {[
              { s: "submitted", icon: ClipboardList, label: "접수된 요청" },
              { s: "in_progress", icon: Activity, label: "처리 중인 요청" },
              { s: "completed", icon: CheckCircle2, label: "완료된 요청" },
              { s: "rejected", icon: FolderOpen, label: "반려된 요청" },
            ].map((item) => (
              <AppLink
                to={`/requests?status=${item.s}`}
                className={`stat-card stat-${item.s}`}
                key={item.s}
              >
                <div>
                  <span className="stat-label">{item.label}</span>
                  <span className="stat-icon">
                    <item.icon size={21} />
                  </span>
                </div>
                <strong>
                  {getCount(item.s)}
                  <small>건</small>
                </strong>
                <span className="stat-footer">
                  요청 확인하기 <ArrowRight size={15} />
                </span>
              </AppLink>
            ))}
          </div>
        )}
        <p className="sr-only">
          업무 현황 표와 동일한 정보: 접수 {getCount("submitted")}건, 처리 중{" "}
          {getCount("in_progress")}건, 완료 {getCount("completed")}건, 반려{" "}
          {getCount("rejected")}건.
        </p>
      </section>
      <div className="dashboard-lower">
        <section className="panel recent-panel">
          <div className="section-heading">
            <div>
              <h2>최근 업무요청</h2>
              <p>가장 최근 등록된 요청을 확인하세요.</p>
            </div>
            <AppLink to="/requests" className="button text-button">
              전체 보기
              <ArrowRight size={16} />
            </AppLink>
          </div>
          {recent.loading ? (
            <Loading />
          ) : recent.error ? (
            <ErrorBox message={recent.error} />
          ) : recent.data?.items.length ? (
            <RequestTable items={recent.data.items} />
          ) : (
            <Empty>
              <AppLink to="/requests/new" className="button secondary">
                <Plus size={16} />첫 요청 등록
              </AppLink>
            </Empty>
          )}
        </section>
        <aside className="quick-panel panel">
          <span className="eyebrow" lang="en">
            QUICK GUIDE
          </span>
          <div className="quick-icon">
            <BookOpen size={30} />
          </div>
          <h2>
            함께 쓰는 서비스,
            <br />
            함께 지키는 기준.
          </h2>
          <p>
            업무요청 사용법부터
            <br />
            접근성·보안 적용 근거까지.
          </p>
          <AppLink to="/help" className="button secondary">
            도움말 & 표준 보기
            <ArrowRight size={16} />
          </AppLink>
          <div className="quick-divider" />
          <span className="muted small-text">
            실행한 검사와 미실행 검사를
            <br />
            투명하게 구분해 안내합니다.
          </span>
        </aside>
      </div>
    </>
  );
}
function RequestTable({ items }: { items: WorkRequest[] }) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="업무요청 표. 좁은 화면에서 좌우 스크롤할 수 있습니다."
    >
      <table className="request-table">
        <caption className="sr-only">
          업무요청 목록 · 제목, 상태, 작성자, 한국시간 등록일
        </caption>
        <thead>
          <tr>
            <th scope="col">업무요청</th>
            <th scope="col">상태</th>
            <th scope="col">작성자</th>
            <th scope="col">등록일 (한국시간)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <AppLink
                  to={`/requests/${encodeURIComponent(item.id)}?returnTo=${encodeURIComponent(safeRequestReturnPath(window.location.pathname === "/requests" ? window.location.pathname + window.location.search : null))}`}
                  className="request-title"
                >
                  {item.title}
                  <ArrowRight size={15} />
                </AppLink>
                <span className="table-category">
                  {categoryNames[item.category] ?? item.category}
                </span>
              </td>
              <td>
                <Badge status={item.status} />
              </td>
              <td>{item.ownerName}</td>
              <td className="table-date">{formatDate(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function RequestList({ search }: { search: string }) {
  const params = new URLSearchParams(search),
    [query, setQuery] = useState(params.get("q") ?? ""),
    [status, setStatus] = useState(params.get("status") ?? ""),
    [sort, setSort] = useState(params.get("sort") ?? "created_desc"),
    [revision, setRevision] = useState(0);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const remote = useRemote(
    `/requests${search || "?page=1"}`,
    parsePage,
    revision,
  );
  useEffect(() => {
    const p = new URLSearchParams(search);
    setQuery(p.get("q") ?? "");
    setStatus(p.get("status") ?? "");
    setSort(p.get("sort") ?? "created_desc");
  }, [search]);
  function apply(event?: FormEvent) {
    event?.preventDefault();
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (status) p.set("status", status);
    p.set("sort", sort);
    p.set("page", "1");
    navigate(`/requests?${p.toString()}`);
  }
  function removeFilter(key: string) {
    const next = new URLSearchParams(search);
    next.delete(key);
    next.set("page", "1");
    navigate(`/requests?${next.toString()}`);
  }
  function next(p: number) {
    const result = new URLSearchParams(search);
    result.set("page", String(p));
    navigate(`/requests?${result.toString()}`);
  }
  return (
    <section className="panel list-panel">
      <div className="section-heading">
        <div>
          <h2>요청 목록</h2>
          <p>검색과 필터로 원하는 업무를 빠르게 찾아보세요.</p>
        </div>
        <AppLink to="/requests/new" className="button primary">
          <Plus size={18} />새 요청 등록
        </AppLink>
      </div>
      <form className="request-filters" onSubmit={apply}>
        <label className="search-field">
          <span className="sr-only">요청 검색</span>
          <Search size={20} />
          <input
            type="search"
            placeholder="제목 또는 내용 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          <span className="sr-only">요청 상태</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">모든 상태</option>
            {Object.entries(statusNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">정렬 기준</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="created_desc">최신 등록순</option>
            <option value="created_asc">오래된 등록순</option>
            <option value="title_asc">제목순</option>
          </select>
        </label>
        <button className="button primary" type="submit">
          검색
        </button>
        <button
          className="button text-button"
          type="button"
          onClick={() => navigate("/requests")}
        >
          초기화
        </button>
      </form>
      {(params.get("q") || params.get("status")) && (
        <div className="filter-tags" aria-label="적용한 검색 필터">
          {params.get("q") && (
            <button className="filter-tag" onClick={() => removeFilter("q")}>
              검색어: {params.get("q")}
              <span className="sr-only"> 필터 해제</span>
              <X size={15} aria-hidden="true" />
            </button>
          )}
          {params.get("status") && (
            <button
              className="filter-tag"
              onClick={() => removeFilter("status")}
            >
              상태:{" "}
              {statusNames[params.get("status") ?? ""] ?? params.get("status")}
              <span className="sr-only"> 필터 해제</span>
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <div className="result-toolbar">
        <p role="status">
          {remote.loading ? (
            "검색 중…"
          ) : (
            <>
              전체 <strong>{remote.data?.total ?? 0}</strong>건
            </>
          )}
          {params.get("q") && <> · 검색어 “{params.get("q")}”</>}
          {params.get("status") && (
            <> · {statusNames[params.get("status") ?? ""]}</>
          )}
        </p>
        <span className="muted small-text">
          {sort === "created_desc"
            ? "최신 등록순"
            : sort === "created_asc"
              ? "오래된 등록순"
              : "제목순"}
        </span>
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <ErrorBox message={remote.error}>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            다시 시도
          </button>
        </ErrorBox>
      ) : remote.data?.items.length ? (
        <RequestTable items={remote.data.items} />
      ) : (
        <Empty
          title={
            search ? "검색 결과가 없습니다." : "아직 등록된 요청이 없습니다."
          }
          description="검색 조건을 변경하거나 새 업무요청을 등록하세요."
        />
      )}
      {remote.data && remote.data.total > remote.data.pageSize && (
        <nav className="pagination" aria-label="요청 목록 페이지">
          <button
            className="button secondary"
            onClick={() => next(page - 1)}
            disabled={page <= 1}
          >
            이전
          </button>
          <span>
            {page} / {Math.ceil(remote.data.total / remote.data.pageSize)}{" "}
            페이지
          </span>
          <button
            className="button secondary"
            onClick={() => next(page + 1)}
            disabled={page * remote.data.pageSize >= remote.data.total}
          >
            다음
          </button>
        </nav>
      )}
    </section>
  );
}
export function RequestDetail({
  id,
  session,
}: {
  id: string;
  session: Session;
}) {
  const [revision, setRevision] = useState(0),
    [statusModal, setStatusModal] = useState(false),
    [newStatus, setNewStatus] = useState("in_progress"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState<number | null>(null);
  const uploadController = useRef<AbortController | null>(null),
    remote = useRemote(
      `/requests/${encodeURIComponent(id)}`,
      parseRequest,
      revision,
    ),
    item = remote.data;
  const own = item?.ownerId === session.user.id;
  const canEdit = own && item?.status === "submitted";
  const admin = session.user.role.toLocaleLowerCase() === "admin";
  const transitions: Record<string, string[]> = {
    submitted: ["in_progress", "rejected"],
    in_progress: ["completed", "rejected"],
    completed: [],
    rejected: [],
  };
  const allowed = transitions[item?.status ?? ""] ?? [];
  async function changeStatus(event: FormEvent) {
    event.preventDefault();
    if (!item || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/requests/${encodeURIComponent(id)}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: newStatus,
          reason,
          version: item.version,
        }),
      });
      setStatusModal(false);
      setReason("");
      setNotice("처리 상태와 이력이 저장되었습니다.");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function removeAttachment(attachmentId: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/attachments/${encodeURIComponent(attachmentId)}`, {
        method: "DELETE",
      });
      setNotice("첨부파일을 삭제했습니다.");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function addFiles() {
    if (!files.length || busy) return;
    const problem = validateFiles(files, item?.attachments.length ?? 0);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    setProgress(0);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      await uploadFiles(id, files, setProgress, controller.signal);
      setFiles([]);
      setNotice("첨부파일을 저장했습니다.");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  if (remote.loading) return <Loading />;
  if (remote.error)
    return (
      <ErrorBox message={remote.error}>
        <AppLink to="/requests" className="button secondary">
          요청 목록으로
        </AppLink>
        <button
          className="button secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          다시 시도
        </button>
      </ErrorBox>
    );
  if (!item) return <Empty />;
  return (
    <>
      <AppLink
        to={safeRequestReturnPath(
          new URLSearchParams(window.location.search).get("returnTo"),
        )}
        className="back-link"
      >
        <ArrowLeft size={17} />
        요청 목록으로
      </AppLink>
      {notice && <Success>{notice}</Success>}
      {error && !statusModal && <ErrorBox message={error} />}
      <section className="panel detail-panel">
        <div className="detail-title">
          <div>
            <div className="detail-labels">
              <span className="eyebrow">
                {categoryNames[item.category] ?? item.category}
              </span>
              <Badge status={item.status} />
            </div>
            <h2>{item.title}</h2>
            <p className="muted">
              {item.ownerName} · {formatDate(item.createdAt)} (한국시간)
            </p>
          </div>
          <div className="detail-actions">
            {canEdit && (
              <AppLink
                to={`/requests/${encodeURIComponent(id)}/edit`}
                className="button secondary"
              >
                요청 수정
              </AppLink>
            )}
            {admin && allowed.length > 0 && (
              <button
                className="button primary"
                onClick={() => {
                  setNewStatus(allowed[0] ?? "in_progress");
                  setStatusModal(true);
                  setError("");
                }}
              >
                처리 상태 변경
              </button>
            )}
          </div>
        </div>
        <div className="request-body">
          <h3>요청 내용</h3>
          <p>{item.description}</p>
        </div>
        <section
          className="attachment-section"
          aria-labelledby="attachment-title"
        >
          <h3 id="attachment-title">
            <Paperclip size={19} />
            첨부파일 <span>{item.attachments.length}</span>
          </h3>
          {item.attachments.length === 0 ? (
            <p className="muted">등록된 첨부파일이 없습니다.</p>
          ) : (
            <ul className="attachment-list">
              {item.attachments.map((file) => (
                <li key={file.id}>
                  <FileText size={21} />
                  <div>
                    <a
                      href={`/api/attachments/${encodeURIComponent(file.id)}/download`}
                    >
                      {file.fileName}
                      <ArrowDownToLine size={15} />
                    </a>
                    <small>{(file.size / 1024).toFixed(1)} KB</small>
                  </div>
                  {canEdit && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      onClick={() => {
                        void removeAttachment(file.id);
                      }}
                      aria-label={`${file.fileName} 삭제`}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="detail-upload">
              <label htmlFor="detail-files">
                추가 첨부 <span className="optional">선택</span>
              </label>
              <input
                id="detail-files"
                type="file"
                multiple
                accept=".txt,.pdf,.png"
                aria-describedby="detail-files-help"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <p className="field-help" id="detail-files-help">
                TXT, PDF, PNG · 파일당 5 MB · 기존 파일 포함 최대 3개. 악성코드
                엔진 검사는 제공되지 않습니다.
              </p>
              <button
                className="button secondary"
                disabled={busy || files.length === 0}
                onClick={() => {
                  void addFiles();
                }}
              >
                <Upload size={16} />
                선택한 파일 업로드
              </button>
              {progress !== null && (
                <div className="upload-progress" role="status">
                  <progress
                    max={100}
                    value={progress}
                    aria-label="파일 업로드 진행률"
                  />
                  {progress}%{" "}
                  <button
                    className="button text-button"
                    onClick={() => uploadController.current?.abort()}
                  >
                    업로드 취소
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </section>
      <section className="panel history-panel">
        <div className="section-heading">
          <div>
            <h2>처리 이력</h2>
            <p>상태 변경과 주요 작업이 기록됩니다.</p>
          </div>
          <Activity size={21} />
        </div>
        {item.histories.length ? (
          <ol className="history-list">
            {item.histories.map((history) => (
              <li key={history.id}>
                <span className="history-dot" />
                <div>
                  <strong>
                    {history.toStatus
                      ? `${statusNames[history.toStatus] ?? history.toStatus} 상태로 변경`
                      : history.action}
                  </strong>
                  <p>{history.reason || "요청이 등록되었습니다."}</p>
                  <small>
                    {history.actorName} · {formatDate(history.createdAt)}{" "}
                    (한국시간)
                  </small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">기록된 처리 이력이 없습니다.</p>
        )}
      </section>
      {statusModal && (
        <Modal
          title="처리 상태 변경"
          onClose={() => {
            if (!busy) setStatusModal(false);
          }}
        >
          <p>
            현재 상태: <Badge status={item.status} />
          </p>
          {error && <ErrorBox message={error} />}
          <form
            onSubmit={(event) => {
              void changeStatus(event);
            }}
          >
            <label htmlFor="change-status">
              변경할 상태 <span className="required">필수</span>
            </label>
            <select
              id="change-status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              {allowed.map((s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ))}
            </select>
            <label htmlFor="change-reason">
              변경 사유 <span className="required">필수</span>
            </label>
            <textarea
              id="change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              rows={4}
              aria-describedby="change-reason-help"
            />
            <p className="field-help" id="change-reason-help">
              3~500자로 입력하세요. 변경 사유는 처리 이력에 남습니다.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setStatusModal(false)}
              >
                취소
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? "저장 중…" : "변경 내용 저장"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function validateFiles(files: File[], existing = 0): string {
  if (files.length + existing > 3)
    return "첨부파일은 기존 파일을 포함해 최대 3개까지 등록할 수 있습니다.";
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024)
      return `${file.name}: 파일당 최대 5 MB까지 첨부할 수 있습니다.`;
    if (!/\.(txt|pdf|png)$/iu.test(file.name))
      return `${file.name}: TXT, PDF, PNG 형식만 첨부할 수 있습니다.`;
  }
  return "";
}
export function RequestWizard({
  draft,
  setDraft,
  editingId,
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  editingId?: string;
}) {
  const [step, setStep] = useState(1),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [savedId, setSavedId] = useState(""),
    [version, setVersion] = useState(0),
    [progress, setProgress] = useState<number | null>(null),
    [loading, setLoading] = useState(!!editingId),
    [done, setDone] = useState(false),
    [cancelModal, setCancelModal] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null),
    stepTitle = useRef<HTMLHeadingElement>(null),
    uploadController = useRef<AbortController | null>(null),
    idempotencyKey = useRef(crypto.randomUUID());
  useEffect(() => {
    if (editingId) {
      const controller = new AbortController();
      setLoading(true);
      void api(`/requests/${encodeURIComponent(editingId)}`, {
        signal: controller.signal,
      })
        .then((raw) => {
          if (controller.signal.aborted) return;
          const item = parseRequest(raw);
          setVersion(item.version);
          setDraft((old) =>
            old.editingId === editingId
              ? old
              : {
                  title: item.title,
                  category: item.category,
                  description: item.description,
                  files: [],
                  editingId,
                },
          );
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }
    setDraft((old) => (old.editingId ? initialDraft : old));
  }, [editingId, setDraft]);
  useEffect(() => {
    stepTitle.current?.focus();
  }, [step]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  function validate(stage: number): boolean {
    const next: Record<string, string> = {};
    if (stage === 1 && draft.title.trim().length < 3)
      next.title = "요청 제목은 3~100자로 입력하세요.";
    if (stage === 2 && draft.description.trim().length < 10)
      next.description = "요청 내용은 10~5,000자로 입력하세요.";
    if (stage === 2) {
      const problem = validateFiles(draft.files);
      if (problem) next.files = problem;
    }
    setErrors(next);
    if (Object.keys(next).length) {
      window.requestAnimationFrame(() => errorSummary.current?.focus());
      return false;
    }
    return true;
  }
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let id = savedId;
      if (!id) {
        const item = parseRequest(
          await api(
            editingId
              ? `/requests/${encodeURIComponent(editingId)}`
              : "/requests",
            {
              method: editingId ? "PUT" : "POST",
              headers: editingId
                ? {}
                : { "Idempotency-Key": idempotencyKey.current },
              body: JSON.stringify({
                title: draft.title.trim(),
                category: draft.category,
                description: draft.description.trim(),
                ...(editingId ? { version } : {}),
              }),
            },
          ),
        );
        id = item.id;
        setSavedId(id);
      }
      if (draft.files.length) {
        setProgress(0);
        const controller = new AbortController();
        uploadController.current = controller;
        await uploadFiles(id, draft.files, setProgress, controller.signal);
      }
      setDone(true);
      setStep(4);
      setDraft(initialDraft);
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(cause.fieldErrors)) {
          const key = field.split(".").at(-1)?.toLowerCase() ?? "";
          if (["title", "category", "description", "files"].includes(key))
            fieldErrors[key] = messages.join(" ");
        }
        if (Object.keys(fieldErrors).length) {
          setErrors(fieldErrors);
          setStep(fieldErrors.title || fieldErrors.category ? 1 : 2);
        }
      }
      window.requestAnimationFrame(() => errorSummary.current?.focus());
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  if (loading) return <Loading label="수정할 요청을 불러오는 중입니다." />;
  return (
    <div className="wizard-layout">
      <section className="panel wizard-panel">
        <ol className="stepper" aria-label="업무요청 등록 단계">
          {["기본정보", "내용 · 첨부", "검토", "완료"].map((label, index) => (
            <li
              key={label}
              className={
                step === index + 1
                  ? "current"
                  : step > index + 1
                    ? "complete"
                    : ""
              }
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{step > index + 1 ? <Check size={16} /> : index + 1}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
        {done ? (
          <div className="completion">
            <div className="completion-icon">
              <CheckCircle2 size={45} />
            </div>
            <span className="eyebrow" lang="en">
              REQUEST {editingId ? "UPDATED" : "SUBMITTED"}
            </span>
            <h2 ref={stepTitle} tabIndex={-1}>
              요청이 {editingId ? "수정" : "등록"}되었습니다.
            </h2>
            <p>
              접수부터 완료까지 진행 상황을
              <br />
              요청 상세에서 확인할 수 있습니다.
            </p>
            <div className="completion-actions">
              <AppLink
                to={`/requests/${encodeURIComponent(savedId)}`}
                className="button primary"
              >
                등록한 요청 보기
                <ArrowRight size={17} />
              </AppLink>
              <AppLink to="/requests" className="button secondary">
                요청 목록으로
              </AppLink>
            </div>
          </div>
        ) : (
          <>
            <div className="wizard-heading">
              <span className="eyebrow" lang="en">
                STEP 0{step} / 03
              </span>
              <h2 ref={stepTitle} tabIndex={-1}>
                {step === 1
                  ? "어떤 도움이 필요하신가요?"
                  : step === 2
                    ? "요청 내용을 알려주세요."
                    : "등록 전, 내용을 확인하세요."}
              </h2>
              <p>
                {step === 1
                  ? "알아보기 쉬운 제목과 요청 유형을 선택해 주세요."
                  : step === 2
                    ? "필요한 내용을 구체적으로 적으면 더 빠르게 처리할 수 있습니다."
                    : "아래 내용으로 요청을 저장합니다. 이전 단계에서 수정할 수 있습니다."}
              </p>
            </div>
            {(Object.keys(errors).length > 0 || error) && (
              <div
                ref={errorSummary}
                tabIndex={-1}
                className="error-summary"
                role="alert"
              >
                <strong>입력 내용을 확인하세요.</strong>
                {error && <p>{error}</p>}
                <ul>
                  {Object.entries(errors).map(([key, value]) => (
                    <li key={key}>
                      <a href={`#request-${key}`}>{value}</a>
                    </li>
                  ))}
                </ul>
                {savedId && (
                  <p>
                    요청 본문은 저장되었습니다. 첨부 업로드를 다시 시도하거나{" "}
                    <AppLink to={`/requests/${savedId}`}>
                      저장된 요청을 확인
                    </AppLink>
                    하세요.
                  </p>
                )}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (step < 3) {
                  if (validate(step)) setStep((s) => s + 1);
                } else void submit();
              }}
              noValidate
            >
              {step === 1 && (
                <div className="form-fields">
                  <div>
                    <label htmlFor="request-title">
                      요청 제목 <span className="required">필수</span>
                    </label>
                    <input
                      id="request-title"
                      value={draft.title}
                      onChange={(e) => update("title", e.target.value)}
                      maxLength={100}
                      required
                      aria-invalid={!!errors.title}
                      aria-describedby={`request-title-help${errors.title ? " request-title-error" : ""}`}
                      placeholder="예: 디자인 도구 사용 권한을 요청합니다"
                    />
                    <div className="field-meta">
                      <p id="request-title-help" className="field-help">
                        요청 목적이 드러나도록 3~100자로 입력하세요.
                      </p>
                      <span>{draft.title.length}/100</span>
                    </div>
                    {errors.title && (
                      <p id="request-title-error" className="field-error">
                        {errors.title}
                      </p>
                    )}
                  </div>
                  <fieldset
                    className="category-field"
                    id="request-category"
                    tabIndex={-1}
                    aria-invalid={!!errors.category}
                    aria-describedby={
                      errors.category ? "request-category-error" : undefined
                    }
                  >
                    <legend>
                      요청 유형 <span className="required">필수</span>
                    </legend>
                    <div className="category-options">
                      {Object.entries(categoryNames).map(([value, label]) => (
                        <label
                          key={value}
                          className={draft.category === value ? "selected" : ""}
                        >
                          <input
                            type="radio"
                            name="category"
                            value={value}
                            checked={draft.category === value}
                            onChange={() => update("category", value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {errors.category && (
                      <p className="field-error" id="request-category-error">
                        {errors.category}
                      </p>
                    )}
                  </fieldset>
                </div>
              )}
              {step === 2 && (
                <div className="form-fields">
                  <div>
                    <label htmlFor="request-description">
                      요청 내용 <span className="required">필수</span>
                    </label>
                    <textarea
                      id="request-description"
                      rows={8}
                      value={draft.description}
                      onChange={(e) => update("description", e.target.value)}
                      maxLength={5000}
                      required
                      aria-invalid={!!errors.description}
                      aria-describedby={`request-description-help${errors.description ? " request-description-error" : ""}`}
                      placeholder="필요한 작업, 배경, 원하는 결과를 알려주세요."
                    />
                    <div className="field-meta">
                      <p className="field-help" id="request-description-help">
                        10~5,000자. 비밀번호 등 민감한 정보는 입력하지 마세요.
                      </p>
                      <span>
                        {draft.description.length.toLocaleString()}/5,000
                      </span>
                    </div>
                    {errors.description && (
                      <p className="field-error" id="request-description-error">
                        {errors.description}
                      </p>
                    )}
                  </div>
                  <div className="upload-area">
                    <Upload size={28} />
                    <label htmlFor="request-files">
                      첨부파일 <span className="optional">선택</span>
                    </label>
                    <p>끌어놓기 없이 파일 선택으로 간단하게 첨부하세요.</p>
                    <input
                      id="request-files"
                      type="file"
                      multiple
                      accept=".txt,.pdf,.png"
                      onChange={(event) => {
                        update("files", Array.from(event.target.files ?? []));
                      }}
                      aria-invalid={!!errors.files}
                      aria-describedby={`request-files-help${errors.files ? " request-files-error" : ""}`}
                    />
                    <p className="field-help" id="request-files-help">
                      TXT, PDF, PNG · 파일당 5 MB · 최대 3개
                      <br />
                      악성코드 검사 엔진은 제공되지 않습니다.
                    </p>
                    {draft.files.length > 0 && (
                      <ul className="selected-files">
                        {draft.files.map((file, i) => (
                          <li key={`${file.name}-${i}`}>
                            <Paperclip size={15} />
                            {file.name}
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`${file.name} 선택 해제`}
                              onClick={() =>
                                update(
                                  "files",
                                  draft.files.filter((_, index) => i !== index),
                                )
                              }
                            >
                              <X size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {errors.files && (
                      <p className="field-error" id="request-files-error">
                        {errors.files}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="review-content">
                  <div className="notice-banner">
                    <ShieldCheck size={20} />
                    <p>
                      아래 내용을 확인한 뒤{" "}
                      <strong>
                        {editingId ? "수정 내용 저장" : "요청 등록"}
                      </strong>{" "}
                      버튼을 누르세요. 저장 후 접수 상태에서 수정할 수 있습니다.
                    </p>
                  </div>
                  <dl>
                    <div>
                      <dt>요청 제목</dt>
                      <dd>{draft.title}</dd>
                    </div>
                    <div>
                      <dt>요청 유형</dt>
                      <dd>{categoryNames[draft.category]}</dd>
                    </div>
                    <div>
                      <dt>요청 내용</dt>
                      <dd className="preserve-lines">{draft.description}</dd>
                    </div>
                    <div>
                      <dt>첨부파일</dt>
                      <dd>
                        {draft.files.length
                          ? draft.files.map((file) => (
                              <p key={file.name}>
                                {file.name} · {(file.size / 1024).toFixed(1)} KB
                              </p>
                            ))
                          : "선택한 파일 없음"}
                      </dd>
                    </div>
                  </dl>
                  {progress !== null && (
                    <div className="upload-progress" role="status">
                      <progress
                        max={100}
                        value={progress}
                        aria-label="첨부 업로드 진행률"
                      />
                      {progress}%
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => uploadController.current?.abort()}
                      >
                        업로드 취소
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="wizard-actions">
                <button
                  className="button text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelModal(true)}
                >
                  작성 취소
                </button>
                <div>
                  {step > 1 && (
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busy || !!savedId}
                      onClick={() => {
                        setErrors({});
                        setStep((s) => s - 1);
                      }}
                    >
                      <ArrowLeft size={16} />
                      이전 단계
                    </button>
                  )}
                  <button
                    className="button primary"
                    type="submit"
                    disabled={busy}
                  >
                    {busy
                      ? "저장 중…"
                      : step < 3
                        ? "다음 단계"
                        : savedId
                          ? "첨부 업로드 재시도"
                          : editingId
                            ? "수정 내용 저장"
                            : "요청 등록"}
                    {!busy && <ArrowRight size={17} />}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </section>
      <aside className="wizard-aside">
        <div className="aside-icon">
          <FilePlus2 size={29} />
        </div>
        <h3>
          명확한 요청이
          <br />
          좋은 결과를 만듭니다.
        </h3>
        <ul>
          <li>
            <CheckCircle2 size={17} />
            요청 목적을 간결하게 적어주세요.
          </li>
          <li>
            <CheckCircle2 size={17} />
            필요한 자료를 함께 첨부하세요.
          </li>
          <li>
            <CheckCircle2 size={17} />
            등록 전 내용을 검토해 주세요.
          </li>
        </ul>
        <p>
          이전 단계로 이동해도 입력한 내용은 유지됩니다. 작성 내용은 브라우저에
          영구 저장되지 않습니다.
        </p>
        <AppLink to="/help?tab=guide">
          도움이 필요하신가요?
          <ArrowRight size={15} />
        </AppLink>
      </aside>
      {cancelModal && (
        <Modal
          title="요청 작성을 취소할까요?"
          onClose={() => setCancelModal(false)}
        >
          <p>입력한 제목, 내용과 선택한 파일이 초기화됩니다.</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setCancelModal(false)}
            >
              계속 작성
            </button>
            <button
              className="button danger"
              onClick={() => {
                setDraft(initialDraft);
                navigate("/requests");
              }}
            >
              작성 취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function Help({
  tab,
  preferences,
}: {
  tab: string;
  preferences: ReactNode;
}) {
  return (
    <>
      <nav className="help-tabs" aria-label="도움말 분류">
        {[
          { id: "standards", label: "표준 적용 라이브러리", icon: BookOpen },
          { id: "guide", label: "이용 · 접근성 안내", icon: HelpCircle },
          { id: "preferences", label: "화면 설정", icon: Settings2 },
        ].map((item) => (
          <AppLink
            key={item.id}
            to={`/help?tab=${item.id}`}
            className={tab === item.id ? "active" : ""}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <item.icon size={19} />
            {item.label}
          </AppLink>
        ))}
      </nav>
      {tab === "guide" ? (
        <div className="guide-grid">
          <section className="panel prose">
            <span className="eyebrow" lang="en">
              GET STARTED
            </span>
            <h2>요청 등록부터 완료까지</h2>
            <ol className="guide-steps">
              <li>
                <strong>업무 공간에 로그인합니다.</strong>
                <p>
                  일반 사용자는 본인의 요청을, 관리자는 전체 요청을 확인합니다.
                </p>
              </li>
              <li>
                <strong>새 업무요청을 등록합니다.</strong>
                <p>
                  기본정보 → 내용·첨부 → 검토 순서로 진행합니다. 이전 단계로
                  돌아가도 입력한 내용은 유지됩니다.
                </p>
              </li>
              <li>
                <strong>요청 상세에서 진행 상황을 확인합니다.</strong>
                <p>
                  접수 상태에서 본인 요청을 수정하거나 첨부를 추가할 수
                  있습니다. 파일은 본인과 관리자만 다운로드할 수 있습니다.
                </p>
              </li>
              <li>
                <strong>관리자가 상태를 변경합니다.</strong>
                <p>
                  접수 → 처리 중 → 완료, 또는 접수·처리 중 → 반려가 가능합니다.
                  변경 사유와 처리 이력이 기록됩니다.
                </p>
              </li>
            </ol>
          </section>
          <section className="panel prose">
            <span className="eyebrow" lang="en">
              ACCESSIBILITY
            </span>
            <h2>편리하게 이용하기</h2>
            <dl className="keyboard-guide">
              <div>
                <dt>
                  <kbd>Tab</kbd> / <kbd>Shift + Tab</kbd>
                </dt>
                <dd>다음 또는 이전 조작 대상으로 이동합니다.</dd>
              </div>
              <div>
                <dt>
                  <kbd>Enter</kbd> / <kbd>Space</kbd>
                </dt>
                <dd>버튼을 실행합니다. 링크는 Enter로 이동합니다.</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>
                  열린 대화상자를 닫습니다. 닫힌 뒤 원래 버튼으로 초점이
                  돌아갑니다.
                </dd>
              </div>
              <div>
                <dt>본문 바로가기</dt>
                <dd>
                  페이지의 첫 Tab에서 본문 바로가기 링크를 사용할 수 있습니다.
                </dd>
              </div>
            </dl>
            <p>
              브라우저의 확대와 글자 간격 설정을 사용할 수 있습니다. 표는 좁은
              화면에서 좌우로 스크롤할 수 있습니다.
            </p>
            <p>
              음성이나 색상만으로 정보를 전달하지 않습니다. 시스템의 모션 감소
              설정을 반영하며, 화면 설정에서도 움직임을 줄일 수 있습니다.
            </p>
            <AppLink to="/help?tab=preferences" className="button secondary">
              화면 설정 열기
              <ArrowRight size={16} />
            </AppLink>
          </section>
          <section className="panel prose">
            <h2>검증 범위와 제한</h2>
            <p>
              자동 접근성 검사는 실제 화면낭독기 음성 출력, 읽기 맥락과 사용성을
              모두 검증하지 못합니다. 실제 수행 여부는 표준 라이브러리의
              자동·수동 결과와 증빙에서 확인하세요.
            </p>
            <p>
              MDR은 국방 메타데이터 관리시스템(Meta Data Registry)으로 명칭을
              확인했으며 원본 코드표·사업 적용 범위는 확인필요입니다. 환경이
              없는 보조기술 검사와 운영 전 보안 조치는 미실행으로 구분합니다. 이
              샘플은 웹접근성 인증이나 특정 규제의 적합 제품을 주장하지
              않습니다.
            </p>
          </section>
          <section className="panel prose">
            <h2>문의와 문제 신고</h2>
            <p>
              로컬 샘플에는 외부 메일 발송 기능이 없습니다. 서비스 관리자에게
              화면 이름, 수행한 작업, 오류의 추적 ID를 전달하세요. 비밀번호와
              세션 토큰은 포함하지 마세요.
            </p>
            <p>
              요청 등록이 가능한 상태라면 <strong>일반 업무</strong> 유형으로
              이용 중 어려움을 기록할 수 있습니다.
            </p>
            <AppLink to="/requests/new" className="button secondary">
              업무요청 등록
              <ArrowRight size={16} />
            </AppLink>
          </section>
        </div>
      ) : tab === "preferences" ? (
        preferences
      ) : (
        <StandardsBrowser />
      )}
    </>
  );
}
export function Preferences({
  fontSize,
  motion,
  setFontSize,
  setMotion,
}: {
  fontSize: string;
  motion: string;
  setFontSize: (value: string) => void;
  setMotion: (value: string) => void;
}) {
  const [notice, setNotice] = useState("");
  return (
    <section className="panel preferences-panel prose">
      <span className="eyebrow" lang="en">
        MAKE IT COMFORTABLE
      </span>
      <h2>나에게 편한 화면으로</h2>
      <p>
        아래 설정은 현재 브라우저에 저장됩니다. 기본 화면에서도 모든 주요 기능을
        이용할 수 있습니다.
      </p>
      <fieldset>
        <legend>본문 글자 크기</legend>
        <p className="field-help">
          브라우저의 확대 기능과 함께 사용할 수 있습니다.
        </p>
        <div className="preference-options">
          <label>
            <input
              type="radio"
              name="font-size"
              checked={fontSize === "default"}
              onChange={() => {
                setFontSize("default");
                setNotice("본문 글자 크기를 기본 17px로 변경했습니다.");
              }}
            />
            기본 (17px)
          </label>
          <label>
            <input
              type="radio"
              name="font-size"
              checked={fontSize === "large"}
              onChange={() => {
                setFontSize("large");
                setNotice("본문 글자 크기를 크게 20px로 변경했습니다.");
              }}
            />
            크게 (20px)
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>움직임 설정</legend>
        <p className="field-help">
          운영체제의 모션 감소 설정은 기본으로 반영됩니다.
        </p>
        <div className="preference-options">
          <label>
            <input
              type="radio"
              name="motion"
              checked={motion === "system"}
              onChange={() => {
                setMotion("system");
                setNotice("시스템의 모션 설정을 사용합니다.");
              }}
            />
            시스템 설정 따르기
          </label>
          <label>
            <input
              type="radio"
              name="motion"
              checked={motion === "reduce"}
              onChange={() => {
                setMotion("reduce");
                setNotice("움직임을 줄였습니다.");
              }}
            />
            움직임 줄이기
          </label>
        </div>
      </fieldset>
      <button
        className="button secondary"
        onClick={() => {
          setFontSize("default");
          setMotion("system");
          setNotice("모든 화면 설정을 기본값으로 복원했습니다.");
        }}
      >
        기본값 복원
      </button>
      <p role="status">{notice}</p>
    </section>
  );
}
export function Gallery() {
  const [modal, setModal] = useState(false),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <>
      <div className="notice-banner">
        <Layers3 size={22} />
        <p>
          <strong>같은 기준, 일관된 경험.</strong> 키보드로 이동하며
          기본·초점·오류·비활성·로딩 상태를 살펴보세요. 실제 업무 기능은
          업무요청 메뉴에서 이용할 수 있습니다.
        </p>
      </div>
      <div className="gallery-grid">
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            01 / ACTIONS
          </span>
          <h2>버튼</h2>
          <p>동작의 우선순위를 구분하고 작업 이름을 명확하게 표시합니다.</p>
          <div className="gallery-examples">
            <button
              className="button primary"
              onClick={() => setNotice("기본 버튼이 실행되었습니다.")}
            >
              <Plus size={17} />
              기본 동작
            </button>
            <button
              className="button secondary"
              onClick={() => setNotice("보조 버튼이 실행되었습니다.")}
            >
              보조 동작
            </button>
            <button className="button secondary" disabled>
              비활성
            </button>
            <button className="button primary" disabled aria-busy="true">
              처리 중…
            </button>
          </div>
          <p className="field-help">
            Tab으로 이동하면 초점 테두리가 표시됩니다. 주요 조작 영역은 최소
            44×44px입니다.
          </p>
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            02 / STATUS
          </span>
          <h2>상태 배지</h2>
          <p>색상과 함께 텍스트로 상태를 구분합니다.</p>
          <div className="gallery-examples">
            {Object.keys(statusNames).map((s) => (
              <Badge status={s} key={s} />
            ))}
          </div>
          <Success>요청이 정상적으로 저장되었습니다.</Success>
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            03 / INPUT & ERRORS
          </span>
          <h2>입력과 오류 안내</h2>
          <label htmlFor="gallery-input">
            요청 제목 <span className="required">필수</span>
          </label>
          <input
            id="gallery-input"
            aria-describedby={`gallery-input-help${error ? " gallery-input-error" : ""}`}
            aria-invalid={error}
            placeholder="알아보기 쉬운 제목을 입력하세요."
          />
          <p className="field-help" id="gallery-input-help">
            3~100자로 입력하세요.
          </p>
          {error && (
            <p className="field-error" id="gallery-input-error">
              제목이 너무 짧습니다. 3자 이상 입력하세요.
            </p>
          )}
          <button
            className="button secondary"
            onClick={() => setError((v) => !v)}
          >
            {error ? "오류 상태 해제" : "오류 상태 확인"}
          </button>
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            04 / DIALOG
          </span>
          <h2>확인 대화상자</h2>
          <p>
            대화상자 안에서 초점이 이동하고, 닫으면 실행 버튼으로 돌아갑니다.
          </p>
          <button className="button secondary" onClick={() => setModal(true)}>
            대화상자 열기
          </button>
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            05 / FEEDBACK
          </span>
          <h2>로딩과 서버 오류</h2>
          <button
            className="button secondary"
            onClick={() => setBusy((v) => !v)}
          >
            {busy ? "로딩 상태 종료" : "로딩 상태 보기"}
          </button>
          {busy && <Loading label="갤러리 예시 · 정보를 불러오는 중입니다." />}
          <ErrorBox message="갤러리 예시: 서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도하세요." />
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            06 / EMPTY STATE
          </span>
          <h2>빈 결과</h2>
          <Empty
            title="검색 결과가 없습니다."
            description="검색어를 변경하거나 적용한 필터를 초기화하세요."
          />
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            07 / CHECKBOXES
          </span>
          <h2>체크박스와 중간 상태</h2>
          <p>
            복수 선택, 일부 선택, 비활성 상태를 native 체크박스로 제공합니다.
          </p>
          <CheckboxGroupExample />
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            08 / SWITCH
          </span>
          <h2>설정 스위치</h2>
          <p>
            즉시 적용되는 이진 설정의 이름과 상태를 함께 확인할 수 있습니다.
          </p>
          <SwitchExample />
        </section>
        <section className="panel gallery-card">
          <span className="eyebrow" lang="en">
            09 / TABS
          </span>
          <h2>키보드로 이동하는 탭</h2>
          <p>
            좌우 방향키, Home·End로 이동합니다. 선택한 탭은 하나만 Tab 순서에
            포함됩니다.
          </p>
          <TabsExample />
        </section>
      </div>
      <p role="status">{notice}</p>
      {modal && (
        <Modal title="작업을 저장할까요?" onClose={() => setModal(false)}>
          <p>
            갤러리에서 대화상자 동작을 확인하는 예시입니다. 실제 업무 데이터는
            변경되지 않습니다.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setModal(false)}
            >
              취소
            </button>
            <button
              className="button primary"
              onClick={() => {
                setModal(false);
                setNotice("대화상자 확인 동작을 완료했습니다.");
              }}
            >
              확인
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Privacy() {
  return (
    <article className="panel prose privacy-panel">
      <span className="eyebrow" lang="en">
        SAMPLE POLICY / 2026.10.20
      </span>
      <h2>개인정보 처리방침</h2>
      <div className="notice-banner">
        <ShieldCheck size={22} />
        <p>
          이 페이지는 가상 데이터로 운영되는{" "}
          <strong>로컬 샘플의 실제 처리 방식 안내</strong>입니다. 운영 서비스로
          전환하기 전 개인정보 처리자, 법적 근거, 보유 기간과 문의처의 확정이
          필요합니다.
        </p>
      </div>
      <h3>처리하는 데이터</h3>
      <p>
        샘플 계정의 이메일·표시 이름·역할, 입력한 업무요청의 제목·내용·첨부파일,
        작성·변경 시각과 처리 이력, 보안 감사기록을 로컬 SQLite와 파일 저장소에
        보관합니다. 비밀번호는 검증된 프레임워크로 해시하여 저장합니다.
      </p>
      <h3>이용 목적과 접근</h3>
      <p>
        로그인과 역할 확인, 본인 업무요청 관리, 관리자 처리, 변경 이력 확인 및
        보안 감사에 사용합니다. 본인 요청과 첨부파일은 본인과 관리자만 접근할 수
        있습니다. 이 샘플은 외부 분석·광고 서비스로 데이터를 전송하지 않습니다.
      </p>
      <h3>브라우저에 저장되는 정보</h3>
      <p>
        인증 쿠키를 사용하며 스크립트가 인증 쿠키를 읽지 못하도록 HttpOnly를
        설정합니다. 화면 글자 크기와 모션 설정만 localStorage에 저장합니다. 작성
        중인 요청 내용은 열린 화면의 메모리에서 유지하며 영구 저장하지 않습니다.
      </p>
      <h3>보유와 삭제</h3>
      <p>
        로컬 샘플 데이터는 별도의 자동 보유 기간이 정해져 있지 않습니다. 실행
        안내의 백업·복원·개발용 초기화 절차를 확인하세요. 초기화는 지정된 로컬
        DB와 첨부 데이터를 삭제하므로 백업 여부를 확인해야 합니다.
      </p>
      <h3>유의사항과 문의</h3>
      <p>
        실제 개인정보, 비밀번호, 기관의 기밀자료를 입력하지 마세요. 업로드
        악성코드 검사 엔진은 제공되지 않습니다. 데이터 처리 관련 문의는 로컬
        실행을 관리하는 담당자에게 전달하세요.
      </p>
      <AppLink to="/help?tab=guide" className="button secondary">
        서비스 이용 안내로
        <ArrowRight size={16} />
      </AppLink>
    </article>
  );
}
