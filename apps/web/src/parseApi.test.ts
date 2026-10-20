import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entityId,
  parseSession,
  parseRequest,
  parsePage,
  parseFieldErrors,
} from "./api.ts";
const request = {
  id: 42,
  title: "실제 API 형식",
  category: "general",
  description: "서버가 숫자 ID를 반환하는 실제 응답 구조입니다.",
  status: "submitted",
  ownerId: 2,
  ownerName: "샘플 사용자",
  createdAt: "2026-10-20T05:00:00Z",
  updatedAt: "2026-10-20T05:00:00Z",
  version: 1,
  attachments: [
    { id: 8, fileName: "자료.txt", size: 12, contentType: "text/plain" },
  ],
  histories: [
    {
      id: 11,
      action: "create",
      fromStatus: null,
      toStatus: "submitted",
      reason: null,
      actorName: "샘플 사용자",
      createdAt: "2026-10-20T05:00:00Z",
    },
  ],
};
void test("actual ASP.NET numeric entity IDs normalize for session, request and nested records", () => {
  const session = parseSession({
    user: {
      id: 2,
      email: "user@sample.test",
      displayName: "샘플 사용자",
      role: "user",
    },
    expiresAt: "2026-10-20T05:20:00Z",
    remainingSeconds: 1200,
    warningSeconds: 60,
  });
  assert.equal(session.user.id, "2");
  const item = parseRequest(request);
  assert.equal(item.id, "42");
  assert.equal(item.ownerId, session.user.id);
  assert.equal(item.attachments[0]?.id, "8");
  assert.equal(item.histories[0]?.id, "11");
  assert.equal(item.histories[0]?.reason, "");
  assert.equal(
    parsePage({ items: [request], total: 1, page: 1, pageSize: 10 }).items[0]
      ?.id,
    "42",
  );
});
void test("boundary rejects unsafe identifiers and wrong numeric response shapes", () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, {}, true])
    assert.throws(() => entityId(value));
  assert.throws(() => parseRequest({ ...request, version: "1" }));
  assert.throws(() =>
    parseSession({
      user: { id: 2, email: 12, displayName: "샘플", role: "user" },
    }),
  );
});

void test("ProblemDetails field errors preserve server validation messages and reject invalid shapes", () => {
  assert.deepEqual(
    parseFieldErrors({
      Title: ["제목을 확인하세요."],
      Description: ["10자 이상 입력하세요.", false, 12],
      Other: "invalid",
    }),
    { Title: ["제목을 확인하세요."], Description: ["10자 이상 입력하세요."] },
  );
  for (const value of [null, [], false, "error"])
    assert.deepEqual(parseFieldErrors(value), {});
});
