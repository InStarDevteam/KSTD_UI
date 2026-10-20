import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  Check,
  Clock3,
  LoaderCircle,
  X,
  CheckCircle2,
} from "lucide-react";
export const statusNames: Record<string, string> = {
  submitted: "접수",
  in_progress: "처리 중",
  completed: "완료",
  rejected: "반려",
};
export const categoryNames: Record<string, string> = {
  general: "일반 업무",
  access: "접근 권한",
  software: "소프트웨어",
  other: "기타",
};
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status}`}>
      <span aria-hidden="true">
        {status === "completed" ? (
          <Check size={13} />
        ) : (
          <span className="status-dot" />
        )}
      </span>
      {statusNames[status] ?? status}
    </span>
  );
}
export function ErrorBox({
  message,
  traceId = "",
  children,
}: {
  message: string;
  traceId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="error-box" role="alert" tabIndex={-1}>
      <AlertCircle size={21} />
      <div>
        <strong>확인이 필요합니다</strong>
        <p>{message}</p>
        {traceId && <small>추적 ID: {traceId}</small>}
        {children}
      </div>
    </div>
  );
}
export function Loading({
  label = "정보를 불러오는 중입니다.",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      {label}
    </div>
  );
}
export function Empty({
  title = "아직 등록된 요청이 없습니다.",
  description = "새 요청을 등록하면 진행 상황을 여기서 확인할 수 있습니다.",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Clock3 size={30} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  closeLabel = "닫기",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const el = dialog.current;
    el?.showModal();
    return () => {
      el?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusables = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
          event.preventDefault();
          dialog.current?.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Success({ children }: { children: ReactNode }) {
  return (
    <div className="success" role="status">
      <CheckCircle2 size={21} />
      {children}
    </div>
  );
}
/** Native checkbox group with a real DOM indeterminate state, not a color-only imitation. */
export function CheckboxGroupExample() {
  const [selected, setSelected] = useState<string[]>(["inapp"]);
  const allRef = useRef<HTMLInputElement>(null);
  const mixed = selected.length > 0 && selected.length < 2;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = mixed;
  }, [mixed]);
  const choices = [
    { id: "inapp", name: "서비스 안에서 안내 받기" },
    { id: "email", name: "이메일 안내 예시" },
  ];
  return (
    <fieldset className="gallery-choice-group">
      <legend>안내 방식 선택 예시</legend>
      <label className="choice-label">
        <input
          ref={allRef}
          type="checkbox"
          checked={selected.length === 2}
          aria-checked={mixed ? "mixed" : selected.length === 2}
          onChange={(event) =>
            setSelected(event.target.checked ? ["inapp", "email"] : [])
          }
        />
        모두 선택
      </label>
      {choices.map((choice) => (
        <label className="choice-label" key={choice.id}>
          <input
            type="checkbox"
            checked={selected.includes(choice.id)}
            onChange={(event) =>
              setSelected((previous) =>
                event.target.checked
                  ? [...previous, choice.id]
                  : previous.filter((id) => id !== choice.id),
              )
            }
          />
          {choice.name}
        </label>
      ))}
      <label className="choice-label disabled-choice">
        <input type="checkbox" disabled />
        비활성 선택 예시
      </label>
      <p className="field-help" role="status">
        {selected.length}개 선택됨 · 일부만 선택하면 모두 선택에 중간 상태가
        표시됩니다. 실제 안내는 발송하지 않습니다.
      </p>
    </fieldset>
  );
}
export function SwitchExample() {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="gallery-switches">
      <label className="choice-label switch-label">
        <span>알림 미리보기 예시</span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span aria-hidden="true" className="switch-track">
          <span />
        </span>
      </label>
      <p role="status">
        알림 미리보기: <strong>{enabled ? "켜짐" : "꺼짐"}</strong>
      </p>
      <label className="choice-label switch-label disabled-choice">
        <span>비활성 스위치 예시</span>
        <input
          type="checkbox"
          role="switch"
          checked={false}
          aria-checked={false}
          disabled
        />
        <span aria-hidden="true" className="switch-track">
          <span />
        </span>
      </label>
      <p className="field-help">
        키보드 Space로 상태를 변경합니다. 갤러리 예시이며 실제 알림 설정은
        바뀌지 않습니다.
      </p>
    </div>
  );
}
export function TabsExample() {
  const [active, setActive] = useState(0),
    tabs = useRef<(HTMLButtonElement | null)[]>([]),
    id = useId();
  const items = [
    {
      name: "이용 안내",
      content: "요청의 목적과 필요한 내용을 간단하고 명확하게 적어주세요.",
    },
    {
      name: "접근성",
      content:
        "방향키로 탭을 이동하고 Tab으로 선택한 설명 영역에 접근할 수 있습니다.",
    },
    {
      name: "검증 범위",
      content:
        "이 예시는 UI 조작을 보여줍니다. 실제 보조기술과 전체 업무 절차의 수동 검사는 별도로 기록합니다.",
    },
  ];
  return (
    <div className="gallery-tabs">
      <div role="tablist" aria-label="갤러리 안내 예시">
        {items.map((item, index) => (
          <button
            key={item.name}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % items.length
                      : (index + items.length - 1) % items.length;
              setActive(next);
              tabs.current[next]?.focus();
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <section
          role="tabpanel"
          key={item.name}
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
        >
          <p>{item.content}</p>
        </section>
      ))}
    </div>
  );
}
