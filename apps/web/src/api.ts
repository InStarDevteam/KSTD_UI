export interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}
export interface Session {
  user: User;
  expiresAt: string;
  remainingSeconds: number;
  warningSeconds: number;
}
export interface Attachment {
  id: string;
  fileName: string;
  size: number;
  contentType: string;
}
export interface History {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: string;
}
export interface WorkRequest {
  id: string;
  title: string;
  category: string;
  description: string;
  status: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  attachments: Attachment[];
  histories: History[];
}
export interface RequestPage {
  items: WorkRequest[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Summary {
  total: number;
  byStatus: { status: string; count: number }[];
}
export class ApiError extends Error {
  status: number;
  code: string;
  traceId: string;
  fieldErrors: Record<string, string[]>;
  constructor(
    message: string,
    status: number,
    code = "",
    traceId = "",
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.fieldErrors = fieldErrors;
  }
}
/** ProblemDetails validation extensions are untrusted boundary data. */
export function parseFieldErrors(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      if (!Array.isArray(value)) return [];
      const messages: string[] = (value as unknown[]).filter(
        (item): item is string => typeof item === "string",
      );
      return messages.length ? [[key, messages]] : [];
    }),
  );
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("서버 응답 형식을 확인할 수 없습니다.");
  return value as Record<string, unknown>;
}
/** Entity Framework numeric IDs are normalized once at the HTTP boundary. */
export function entityId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error("개체 ID 응답 형식이 올바르지 않습니다.");
}
export function string(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("문자열 응답 형식이 올바르지 않습니다.");
  return value;
}
export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("수치 응답 형식이 올바르지 않습니다.");
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error("목록 응답 형식이 올바르지 않습니다.");
  return value as unknown[];
}
const textOrEmpty = (value: unknown) =>
  typeof value === "string" ? value : "";
export function parseSession(raw: unknown): Session {
  const d = object(raw),
    u = object(d.user);
  return {
    user: {
      id: entityId(u.id),
      email: string(u.email),
      displayName: string(u.displayName),
      role: string(u.role),
    },
    expiresAt: string(d.expiresAt),
    remainingSeconds: number(d.remainingSeconds),
    warningSeconds:
      typeof d.warningSeconds === "number" ? d.warningSeconds : 60,
  };
}
function parseAttachment(raw: unknown): Attachment {
  const a = object(raw);
  return {
    id: entityId(a.id),
    fileName: string(a.fileName),
    size: number(a.size),
    contentType: string(a.contentType),
  };
}
function parseHistory(raw: unknown): History {
  const h = object(raw);
  return {
    id: entityId(h.id),
    action: string(h.action),
    fromStatus: textOrEmpty(h.fromStatus),
    toStatus: textOrEmpty(h.toStatus),
    reason: textOrEmpty(h.reason),
    actorName: string(h.actorName),
    createdAt: string(h.createdAt),
  };
}
export function parseRequest(raw: unknown): WorkRequest {
  const d = object(raw);
  return {
    id: entityId(d.id),
    title: string(d.title),
    category: string(d.category),
    description: textOrEmpty(d.description),
    status: string(d.status),
    ownerId: entityId(d.ownerId),
    ownerName: string(d.ownerName),
    createdAt: string(d.createdAt),
    updatedAt: string(d.updatedAt),
    version: number(d.version),
    attachments: d.attachments ? array(d.attachments).map(parseAttachment) : [],
    histories: d.histories ? array(d.histories).map(parseHistory) : [],
  };
}
export function parsePage(raw: unknown): RequestPage {
  const d = object(raw);
  return {
    items: array(d.items).map(parseRequest),
    total: number(d.total),
    page: number(d.page),
    pageSize: number(d.pageSize),
  };
}
export function parseSummary(raw: unknown): Summary {
  const d = object(raw);
  return {
    total: number(d.total),
    byStatus: array(d.byStatus).map((v) => {
      const s = object(v);
      return { status: string(s.status), count: number(s.count) };
    }),
  };
}
let csrfToken = "";
export async function refreshCsrf(): Promise<void> {
  const result = await api("/auth/csrf");
  csrfToken = string(object(result).token);
}
export async function api(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  try {
    const method = options.method ?? "GET";
    if (method !== "GET" && !csrfToken) await refreshCsrf();
    const response = await fetch(`/api${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(method !== "GET" ? { "X-CSRF-TOKEN": csrfToken } : {}),
        ...options.headers,
      },
    });
    if (response.status === 204) return null;
    const raw: unknown = await response.json();
    if (!response.ok) {
      const p = object(raw);
      throw new ApiError(
        textOrEmpty(p.detail) ||
          textOrEmpty(p.title) ||
          "요청을 처리하지 못했습니다.",
        response.status,
        textOrEmpty(p.code),
        textOrEmpty(p.traceId),
        parseFieldErrors(p.errors),
      );
    }
    return raw;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiError(
        externalSignal?.aborted
          ? "요청을 취소했습니다."
          : "응답 시간이 초과되었습니다. 연결을 확인하고 다시 시도하세요.",
        0,
      );
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.";
}
export async function uploadFiles(
  id: string,
  files: File[],
  onProgress: (value: number) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!csrfToken) await refreshCsrf();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/requests/${encodeURIComponent(id)}/attachments`);
    xhr.withCredentials = true;
    xhr.timeout = 60000;
    xhr.setRequestHeader("X-CSRF-TOKEN", csrfToken);
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    const finish = () => signal.removeEventListener("abort", abort);
    xhr.onload = () => {
      finish();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message =
        "첨부를 업로드하지 못했습니다. 요청 상세에서 다시 첨부할 수 있습니다.";
      try {
        const raw: unknown = JSON.parse(xhr.responseText);
        const p = object(raw);
        message = textOrEmpty(p.detail) || message;
      } catch {
        message += " 서버 응답을 확인할 수 없습니다.";
      }
      reject(new ApiError(message, xhr.status));
    };
    xhr.onerror = () => {
      finish();
      reject(
        new ApiError("네트워크 연결을 확인하고 첨부를 다시 업로드하세요.", 0),
      );
    };
    xhr.onabort = () => {
      finish();
      reject(
        new ApiError("업로드를 취소했습니다. 요청 본문은 저장되었습니다.", 0),
      );
    };
    xhr.ontimeout = () => {
      finish();
      reject(
        new ApiError(
          "업로드 시간이 초과되었습니다. 요청 상세에서 재시도하세요.",
          0,
        ),
      );
    };
    const data = new FormData();
    files.forEach((f) => data.append("files", f));
    xhr.send(data);
  });
}
